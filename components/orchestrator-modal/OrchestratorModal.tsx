'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Play, Zap } from 'lucide-react'
import type { Workflow } from '@/types'
import { AgentIcon } from '@/lib/agent-icons'

interface OrchestratorModalProps {
  open: boolean
  onClose: () => void
  workflow: Workflow
  onRunStarted: (runId: string) => void
}

export default function OrchestratorModal({ open, onClose, workflow, onRunStarted }: OrchestratorModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const steps = workflow.definition.steps
  const phases = buildPhasePreview(steps.map(s => ({ id: s.step_id, deps: s.depends_on, role: s.agent_role })))

  async function handleRun() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflow.id }),
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
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-[rgb(var(--brand))]" />
            Run Workflow
          </DialogTitle>
          <DialogDescription>
            This will spawn {steps.length} agent{steps.length !== 1 ? 's' : ''} across {phases.length} phase{phases.length !== 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        {/* Phase preview */}
        <div className="space-y-2 my-2">
          {phases.map((phase, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-white/30 w-16 flex-shrink-0">Phase {i + 1}</span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {phase.map(step => (
                  <div key={step.id} className="flex items-center gap-1 rounded-lg bg-white/5 border border-white/8 px-2 py-1">
                    <AgentNodeIcon role={step.role} />
                    <span className="text-xs text-white/60 font-mono">{step.id}</span>
                    {step.consensus && <Badge variant="muted" className="text-[10px] px-1 py-0">×3</Badge>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-400 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleRun} loading={loading}>
            <Play className="h-4 w-4" /> Start Run
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function buildPhasePreview(steps: { id: string; deps: string[]; role: string; consensus?: boolean }[]) {
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

function AgentNodeIcon({ role }: { role: string }) {
  return <AgentIcon role={role} className="h-3.5 w-3.5 text-white/50" />
}
