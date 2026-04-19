'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Play, Zap, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import type { Workflow } from '@/types'
import { AgentIcon } from '@/lib/agent-icons'
import Link from 'next/link'

interface OrchestratorModalProps {
  open: boolean
  onClose: () => void
  workflow: Workflow
  onRunStarted: (runId: string) => void
}

export default function OrchestratorModal({ open, onClose, workflow, onRunStarted }: OrchestratorModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [contextJson, setContextJson] = useState('{}')
  const [contextError, setContextError] = useState('')
  const [showContext, setShowContext] = useState(false)

  const steps = workflow.definition.steps
  const phases = buildPhasePreview(steps.map(s => ({ id: s.step_id, deps: s.depends_on, role: s.agent_role, consensus: !!s.consensus })))

  // Detect steps that need URL configuration
  const unconfigured = steps.filter(s =>
    s.agent_role === 'data_ingestor' &&
    s.data_sources?.some(ds =>
      (ds.type === 'http' || ds.type === 'web_scrape') ? !ds.url :
      ds.type === 'google_sheets' ? !ds.spreadsheet_id :
      false
    )
  )

  function handleContextChange(val: string) {
    setContextJson(val)
    try { JSON.parse(val); setContextError('') }
    catch { setContextError('Invalid JSON') }
  }

  async function handleRun() {
    if (contextError) return
    let parsedContext: Record<string, unknown> = {}
    try { parsedContext = JSON.parse(contextJson) } catch { /* use empty */ }

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflow.id, trigger_context: parsedContext }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start run')
      onRunStarted(data.run_id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Zap className="h-5 w-5 text-apple-blue" />
            Launch Swarm
          </DialogTitle>
          <DialogDescription>
            This will spawn {steps.length} agent{steps.length !== 1 ? 's' : ''} across {phases.length} phase{phases.length !== 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        {/* Unconfigured data sources warning */}
        {unconfigured.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg bg-orange-50 border border-orange-200 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-orange-800">Data sources not configured</p>
              <p className="text-xs text-orange-600 mt-0.5">
                {unconfigured.map(s => <code key={s.step_id} className="font-mono">{s.step_id}</code>).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ', ', el], [])} {unconfigured.length === 1 ? 'has' : 'have'} an empty URL. The run will complete but agents may receive error data.
              </p>
              <Link
                href={`/workflows/${workflow.id}`}
                onClick={onClose}
                className="text-xs font-semibold text-orange-700 underline mt-1 inline-block"
              >
                Edit workflow → Data Sources
              </Link>
            </div>
          </div>
        )}

        {/* Phase preview */}
        <div className="space-y-2 my-2">
          {phases.map((phase, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-black/30 w-16 flex-shrink-0">Phase {i + 1}</span>
              <div className="flex flex-wrap gap-2 flex-1">
                {phase.map(step => (
                  <div key={step.id} className="flex items-center gap-1.5 rounded-lg bg-black/[0.03] border border-black/5 px-2.5 py-1.5 shadow-sm">
                    <AgentIcon role={step.role} className="h-3.5 w-3.5 text-black/40" />
                    <span className="text-xs text-black/60 font-mono font-bold tracking-tight">{step.id}</span>
                    {step.consensus && <Badge variant="muted" className="text-[9px] px-1 py-0 bg-black/5">×3</Badge>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Collapsible context input */}
        <div className="border border-black/8 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowContext(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-black/50 hover:text-black hover:bg-black/[0.02] transition-colors"
          >
            <span className="uppercase tracking-widest">Input / Trigger Context</span>
            {showContext ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showContext && (
            <div className="border-t border-black/8 px-4 py-3">
              <p className="text-xs text-black/40 mb-2">
                JSON data passed as <code className="bg-black/5 px-1">trigger_context</code>. Use this to pass a data URL, query, or any input your workflow expects.
              </p>
              <textarea
                value={contextJson}
                onChange={e => handleContextChange(e.target.value)}
                rows={4}
                className="w-full font-mono text-xs border border-black/15 rounded-md px-3 py-2 focus:outline-none focus:border-black/40 bg-transparent resize-y"
                placeholder='{ "data_url": "https://example.com/data.csv" }'
              />
              {contextError && <p className="text-xs text-red-500 mt-1">{contextError}</p>}
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 mt-2">
          <button onClick={onClose} disabled={loading} className="text-sm font-medium text-black/40 hover:text-black transition-colors px-4 py-2">
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={loading || !!contextError}
            className="apple-btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Spinner size="sm" className="text-white" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            Execute
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function buildPhasePreview(steps: { id: string; deps: string[]; role: string; consensus: boolean }[]) {
  const resolved = new Set<string>()
  const phases: typeof steps[] = []
  let remaining = [...steps]
  while (remaining.length > 0) {
    const ready = remaining.filter(s => s.deps.every(d => resolved.has(d)))
    if (!ready.length) break
    phases.push(ready)
    ready.forEach(s => resolved.add(s.id))
    remaining = remaining.filter(s => !ready.includes(s))
  }
  return phases
}
