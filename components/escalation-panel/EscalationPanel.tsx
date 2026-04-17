'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { AgentEvent } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react'

interface EscalationEvent {
  step_id: string
  severity: string
  summary: string
  run_id: string
}

interface Props {
  runId: string
}

export default function EscalationPanel({ runId }: Props) {
  const [pending, setPending] = useState<EscalationEvent | null>(null)
  const [resolved, setResolved] = useState<'approved' | 'rejected' | null>(null)
  const [acting, setActing] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    const supabase = getSupabase()

    // Load existing events to determine state
    supabase
      .from('agent_events')
      .select('*')
      .eq('run_id', runId)
      .in('event_type', ['ESCALATION_REQUESTED', 'HUMAN_APPROVED', 'HUMAN_REJECTED'])
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!data) return
        for (const e of data as AgentEvent[]) {
          if (e.event_type === 'ESCALATION_REQUESTED') {
            const p = e.payload as Record<string, string>
            setPending({ step_id: e.step_id ?? '', severity: p.severity ?? 'unknown', summary: p.summary ?? '', run_id: runId })
          }
          if (e.event_type === 'HUMAN_APPROVED') setResolved('approved')
          if (e.event_type === 'HUMAN_REJECTED') setResolved('rejected')
        }
      })

    // Live updates
    const ch = supabase.channel(`escalation:${runId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'agent_events',
        filter: `run_id=eq.${runId}`,
      }, payload => {
        const e = payload.new as AgentEvent
        if (e.event_type === 'ESCALATION_REQUESTED') {
          const p = e.payload as Record<string, string>
          setPending({ step_id: e.step_id ?? '', severity: p.severity ?? 'unknown', summary: p.summary ?? '', run_id: runId })
          setResolved(null)
        }
        if (e.event_type === 'HUMAN_APPROVED') setResolved('approved')
        if (e.event_type === 'HUMAN_REJECTED') setResolved('rejected')
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [runId])

  async function decide(action: 'approve' | 'reject') {
    if (!pending) return
    setActing(true)
    try {
      await fetch(`/api/runs/${runId}/escalations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, step_id: pending.step_id, notes }),
      })
    } finally {
      setActing(false)
    }
  }

  if (!pending) return null

  const severityColor =
    pending.severity === 'P1' ? 'text-red-400' :
    pending.severity === 'P2' ? 'text-orange-400' :
    'text-yellow-400'

  return (
    <div className={`rounded-xl border px-4 py-4 mb-4 transition-all ${
      resolved
        ? resolved === 'approved'
          ? 'border-[rgb(var(--green))]/30 bg-[rgb(var(--green))]/6'
          : 'border-white/10 bg-white/3 opacity-60'
        : 'border-orange-500/40 bg-orange-500/8 animate-pulse-once'
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {resolved === 'approved'
            ? <CheckCircle className="h-4 w-4 text-[rgb(var(--green))]" />
            : resolved === 'rejected'
            ? <XCircle className="h-4 w-4 text-white/30" />
            : <AlertTriangle className="h-4 w-4 text-orange-400" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-white">
              {resolved === 'approved' ? 'Escalation approved' : resolved === 'rejected' ? 'Escalation rejected' : 'Human approval required'}
            </span>
            <Badge variant="muted" className={`text-[10px] ${severityColor}`}>{pending.severity}</Badge>
            <Badge variant="muted" className="text-[10px]">{pending.step_id.replace(/_/g, ' ')}</Badge>
          </div>
          <p className="text-sm text-white/60 leading-relaxed">{pending.summary}</p>
        </div>
      </div>

      {!resolved && (
        <div className="mt-3 flex items-center gap-2 pl-7">
          <input
            type="text"
            placeholder="Optional notes…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="flex-1 bg-white/6 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-white/20"
          />
          <Button
            size="sm"
            onClick={() => decide('approve')}
            disabled={acting}
            className="bg-[rgb(var(--green))]/80 hover:bg-[rgb(var(--green))] text-black font-semibold"
          >
            {acting ? <Spinner size="sm" /> : <><CheckCircle className="h-3.5 w-3.5" /> Approve</>}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => decide('reject')}
            disabled={acting}
            className="border border-white/15 hover:border-white/25 text-white/60"
          >
            <XCircle className="h-3.5 w-3.5" /> Reject
          </Button>
        </div>
      )}

      {!resolved && (
        <div className="mt-2 pl-7 flex items-center gap-1.5 text-[10px] text-orange-400/70">
          <Clock className="h-3 w-3" />
          Workflow is paused — waiting for your decision
        </div>
      )}
    </div>
  )
}
