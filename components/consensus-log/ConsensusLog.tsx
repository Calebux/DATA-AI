'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { AgentEvent } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface VotePayload {
  step_id: string
  instance_id: string
  vote_index: number
  agent_count: number
  outputs: Record<string, unknown>
  confidence: number
}

interface ConsensusGroup {
  step_id: string
  votes: VotePayload[]
  winnerIndex: number
}

function ConfBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.8 ? 'bg-[rgb(var(--green))]' : value >= 0.6 ? 'bg-amber-400' : 'bg-[rgb(var(--red))]'
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-white/8 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-white/50 tabular-nums w-7 text-right">{pct}%</span>
    </div>
  )
}

function ValueRow({ label, values, winnerIdx }: { label: string; values: unknown[]; winnerIdx: number }) {
  const strs = values.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')))
  const allSame = strs.every(s => s === strs[0])
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${values.length}, 1fr)` }}>
      {strs.map((s, i) => (
        <div
          key={i}
          className={`rounded px-2 py-1 text-[10px] font-mono break-all leading-relaxed ${
            i === winnerIdx
              ? 'bg-[rgb(var(--green))]/10 text-[rgb(var(--green))]/80 border border-[rgb(var(--green))]/20'
              : allSame
              ? 'bg-white/4 text-white/40'
              : 'bg-amber-500/10 text-amber-300/80 border border-amber-500/20'
          }`}
        >
          {s.length > 120 ? s.slice(0, 120) + '…' : s}
        </div>
      ))}
    </div>
  )
}

function StepDisagreement({ group }: { group: ConsensusGroup }) {
  const [open, setOpen] = useState(true)

  // Collect all leaf keys from outputs across all votes
  const outputKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const v of group.votes) {
      for (const outputKey of Object.keys(v.outputs)) {
        const val = v.outputs[outputKey]
        if (val && typeof val === 'object') {
          Object.keys(val as object).forEach(k => keys.add(`${outputKey}.${k}`))
        } else {
          keys.add(outputKey)
        }
      }
    }
    return [...keys].slice(0, 8) // cap at 8 rows
  }, [group.votes])

  function getNestedVal(outputs: Record<string, unknown>, dotKey: string): unknown {
    const [top, sub] = dotKey.split('.')
    if (sub) {
      const parent = outputs[top]
      if (parent && typeof parent === 'object') return (parent as Record<string, unknown>)[sub]
      return undefined
    }
    return outputs[dotKey]
  }

  const agreeCount = outputKeys.filter(k =>
    group.votes.every(v => JSON.stringify(getNestedVal(v.outputs, k)) === JSON.stringify(getNestedVal(group.votes[0].outputs, k)))
  ).length
  const disagreeCount = outputKeys.length - agreeCount

  return (
    <div className="rounded-xl border border-white/6 bg-[rgb(var(--surface))] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors text-left"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-white/30 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-white/30 flex-shrink-0" />}
        <span className="text-sm font-medium text-white font-mono">{group.step_id.replace(/_/g, ' ')}</span>
        <Badge variant="muted" className="text-[10px]">×{group.votes.length} agents</Badge>
        {disagreeCount > 0
          ? <Badge variant="yellow" className="text-[10px]">{disagreeCount} disagreement{disagreeCount > 1 ? 's' : ''}</Badge>
          : <Badge variant="green" className="text-[10px]">unanimous</Badge>
        }
        <span className="ml-auto text-[10px] text-white/25">winner: Agent {group.winnerIndex + 1}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/5">
          {/* Agent header row */}
          <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: `repeat(${group.votes.length}, 1fr)` }}>
            {group.votes.map((v, i) => (
              <div key={i} className={`rounded-lg px-3 py-2 border ${i === group.winnerIndex ? 'border-[rgb(var(--green))]/30 bg-[rgb(var(--green))]/6' : 'border-white/6 bg-[rgb(var(--surface-2))]'}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-medium text-white/70">Agent {i + 1}</span>
                  {i === group.winnerIndex && <Badge variant="green" className="text-[9px] px-1 py-0">winner</Badge>}
                </div>
                <ConfBar value={v.confidence} />
              </div>
            ))}
          </div>

          {/* Value diff rows */}
          <div className="space-y-2">
            <p className="text-[10px] text-white/25 uppercase tracking-widest">Output comparison</p>
            {outputKeys.map(k => (
              <div key={k} className="space-y-1">
                <p className="text-[10px] text-white/35 font-mono">{k}</p>
                <ValueRow
                  label={k}
                  values={group.votes.map(v => getNestedVal(v.outputs, k))}
                  winnerIdx={group.winnerIndex}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface Props {
  runId: string
}

export default function ConsensusLog({ runId }: Props) {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSupabase()
      .from('agent_events')
      .select('*')
      .eq('run_id', runId)
      .in('event_type', ['CONSENSUS_VOTE', 'CONSENSUS_RESOLVED'])
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setEvents(data as AgentEvent[])
        setLoading(false)
      })
  }, [runId])

  const groups = useMemo<ConsensusGroup[]>(() => {
    const byStep: Record<string, VotePayload[]> = {}
    for (const e of events) {
      if (e.event_type !== 'CONSENSUS_VOTE') continue
      const p = e.payload as unknown as VotePayload
      if (!p.step_id) continue
      if (!byStep[p.step_id]) byStep[p.step_id] = []
      byStep[p.step_id].push(p)
    }
    return Object.entries(byStep).map(([step_id, votes]) => {
      const winnerIndex = votes.reduce(
        (best, v, i) => (v.confidence > votes[best].confidence ? i : best),
        0
      )
      return { step_id, votes, winnerIndex }
    })
  }, [events])

  if (loading) return <div className="flex justify-center py-10"><Spinner size="sm" className="text-[rgb(var(--brand))]" /></div>

  if (groups.length === 0) return (
    <p className="text-center py-10 text-white/30 text-sm">No consensus steps ran in this run</p>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <p className="text-xs text-white/40">
          {groups.length} consensus step{groups.length > 1 ? 's' : ''} — agent outputs logged before reconciliation
        </p>
        <div className="flex items-center gap-2 ml-auto text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[rgb(var(--green))]/50 inline-block" />winner</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500/50 inline-block" />disagreed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-white/15 inline-block" />agreed</span>
        </div>
      </div>
      {groups.map(g => <StepDisagreement key={g.step_id} group={g} />)}
    </div>
  )
}
