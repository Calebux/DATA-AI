'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Copy, Check, RefreshCw } from 'lucide-react'

interface WebhookExecutorProps {
  workflowId: string
  onSave?: (config: WebhookConfig) => void
}

export interface WebhookConfig {
  url: string
  secret: string
  events: string[]
}

export default function WebhookExecutor({ workflowId, onSave }: WebhookExecutorProps) {
  const webhookUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/orchestrator`
  const [secret] = useState(() => generateSecret())
  const [copied, setCopied] = useState<'url' | 'secret' | null>(null)
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  async function copy(type: 'url' | 'secret', text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  async function testWebhook() {
    setTestStatus('loading')
    try {
      const res = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId, secret }),
      })
      setTestStatus(res.ok ? 'ok' : 'error')
    } catch {
      setTestStatus('error')
    }
    setTimeout(() => setTestStatus('idle'), 3000)
  }

  const payloadPreview = JSON.stringify(
    { workflow_id: workflowId, trigger_context: { source: 'webhook', timestamp: new Date().toISOString() } },
    null, 2
  )

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-white mb-3">Webhook Endpoint</p>
        <div className="flex gap-2">
          <Input readOnly value={webhookUrl} className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={() => copy('url', webhookUrl)}>
            {copied === 'url' ? <Check className="h-4 w-4 text-[rgb(var(--green))]" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-white mb-3">Secret Token</p>
        <div className="flex gap-2">
          <Input readOnly value={secret} type="password" className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={() => copy('secret', secret)}>
            {copied === 'secret' ? <Check className="h-4 w-4 text-[rgb(var(--green))]" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-white/30 mt-1">Send as X-Webhook-Secret header</p>
      </div>

      <div>
        <p className="text-sm font-medium text-white mb-2">Payload Preview</p>
        <pre className="rounded-lg bg-black/40 border border-white/6 p-3 text-xs text-white/60 overflow-auto">
          {payloadPreview}
        </pre>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={testWebhook} loading={testStatus === 'loading'}>
          <RefreshCw className="h-4 w-4" /> Test Webhook
        </Button>
        {testStatus === 'ok' && <Badge variant="green">200 OK</Badge>}
        {testStatus === 'error' && <Badge variant="red">Failed</Badge>}
      </div>
    </div>
  )
}

function generateSecret(len = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
