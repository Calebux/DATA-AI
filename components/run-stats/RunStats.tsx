'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { WorkflowRun } from '@/types'
import { Zap, Clock, DollarSign, ChevronDown } from 'lucide-react'

// ~$10/1M tokens averaged across GPT-4o input/output pricing
const COST_PER_1M = 10

interface MemRow { step_id: string | null; agent_role: string; tokens_used: number | null }
interface EvtRow  { step_id: string | null; event_type: string; created_at: string }

interface StepStats {
  step_id: string
  agent_role: string
  tokens: number
  durationMs: number
}

const COMPLETE_EVENTS = new Set([
  'TASK_COMPLETE', 'DATA_READY', 'ANALYSIS_READY',
  'EVAL_PASS', 'DELIVERY_SENT', 'CONSENSUS_RESOLVED',
])

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[rgb(var(--surface-2))] border border-white/5 px-2 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-white/30 mb-1">
        {icon}
        <span className="text-[9px] uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  )
}

export default function RunStats({ run }: { run: WorkflowRun }) {
  const [steps, setSteps] = useState<StepStats[]>([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const supabase = getSupabase()
    Promise.all([
      supabase.from('agent_memory').select('step_id,agent_role,tokens_used').eq('run_id', run.id),
      supabase.from('agent_events').select('step_id,event_type,created_at').eq('run_id', run.id).order('created_at', { ascending: true }),
    ]).then(([{ data: mem }, { data: evts }]) => {
      if (!mem || !evts) return

      // Timing: first TASK_ASSIGNED → first complete event per step
      const timing: Record<string, { start?: number; end?: number }> = {}
      for (const e of evts as EvtRow[]) {
        if (!e.step_id) continue
        if (!timing[e.step_id]) timing[e.step_id] = {}
        const t = new Date(e.created_at).getTime()
        if (e.event_type === 'TASK_ASSIGNED' && !timing[e.step_id].start) timing[e.step_id].start = t
        if (COMPLETE_EVENTS.has(e.event_type) && !timing[e.step_id].end) timing[e.step_id].end = t
      }

      // Tokens: sum per step
      const tokenMap: Record<string, { tokens: number; agent_role: string }> = {}
      for (const m of mem as MemRow[]) {
        const k = m.step_id ?? 'unknown'
        if (!tokenMap[k]) tokenMap[k] = { tokens: 0, agent_role: m.agent_role }
        tokenMap[k].tokens += m.tokens_used ?? 0
      }

      setSteps(
        Object.entries(tokenMap).map(([step_id, { tokens, agent_role }]) => {
          const t = timing[step_id]
          return {
            step_id,
            agent_role,
            tokens,
            durationMs: t?.start && t?.end ? t.end - t.start : 0,
          }
        })
      )
    })
  }, [run.id])

  const totalTokens = steps.reduce((s, r) => s + r.tokens, 0)
  const totalCost = (totalTokens / 1_000_000) * COST_PER_1M
  const wallMs = run.completed_at
    ? new Date(run.completed_at).getTime() - new Date(run.triggered_at).getTime()
    : null

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          icon={<Zap className="h-3 w-3" />}
          label="Tokens"
          value={totalTokens > 0 ? `${(totalTokens / 1000).toFixed(1)}k` : '—'}
        />
        <StatTile
          icon={<DollarSign className="h-3 w-3" />}
          label="Cost"
          value={totalCost > 0 ? `$${totalCost.toFixed(3)}` : '—'}
        />
        <StatTile
          icon={<Clock className="h-3 w-3" />}
          label="Time"
          value={wallMs != null ? `${(wallMs / 1000).toFixed(1)}s` : '—'}
        />
      </div>

      {steps.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center gap-1 text-[10px] text-white/30 hover:text-white/50 transition-colors"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            Per-agent breakdown
          </button>

          {expanded && (
            <div className="space-y-1.5 border-t border-white/5 pt-2">
              {steps.map(s => (
                <div key={s.step_id} className="flex items-center gap-2 text-[10px]">
                  <span className="text-white/40 flex-1 truncate font-mono">{s.step_id}</span>
                  <span className="text-white/30 tabular-nums">
                    {s.tokens > 0 ? `${s.tokens.toLocaleString()}t` : '—'}
                  </span>
                  <span className="text-white/20 tabular-nums w-10 text-right">
                    {s.durationMs > 0 ? `${(s.durationMs / 1000).toFixed(1)}s` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
