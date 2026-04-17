'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { AgentEvent } from '@/types'
import { Network, GitBranch, RotateCcw, Users, Cpu, ShieldCheck } from 'lucide-react'

interface Props {
  runId: string
  /** Optional: pass pre-fetched events (e.g. from replay mode) to skip fetch */
  events?: AgentEvent[]
}

export default function SwarmMetrics({ runId, events: propEvents }: Props) {
  const [fetchedEvents, setFetchedEvents] = useState<AgentEvent[]>([])

  useEffect(() => {
    if (propEvents !== undefined) return
    const supabase = getSupabase()
    supabase.from('agent_events').select('*').eq('run_id', runId)
      .then(({ data }) => { if (data) setFetchedEvents(data as AgentEvent[]) })

    const ch = supabase.channel(`metrics:${runId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_events', filter: `run_id=eq.${runId}` },
        p => setFetchedEvents(prev => [...prev, p.new as AgentEvent])
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [runId, propEvents])

  const events = propEvents ?? fetchedEvents

  const metrics = useMemo(() => {
    const agentsSpawned = new Set<string>()
    let consensusRounds = 0
    let retries = 0
    let humanInterventions = 0
    let autonomousDecisions = 0
    const messageMap: Record<string, number> = {}

    for (const ev of events) {
      if (ev.step_id) agentsSpawned.add(`${ev.source_agent}:${ev.step_id}`)
      if (ev.event_type === 'CONSENSUS_START') consensusRounds++
      if (ev.event_type === 'EVAL_FAIL_RETRY') retries++
      if (ev.event_type === 'HUMAN_APPROVED' || ev.event_type === 'HUMAN_REJECTED') humanInterventions++
      if (ev.event_type === 'CONSENSUS_RESOLVED' || ev.event_type === 'EVAL_PASS') autonomousDecisions++
      messageMap[ev.source_agent] = (messageMap[ev.source_agent] ?? 0) + 1
    }

    let topAgent = ''
    let topCount = 0
    for (const [agent, count] of Object.entries(messageMap)) {
      if (count > topCount) { topAgent = agent; topCount = count }
    }

    return { agentsSpawned: agentsSpawned.size, totalEvents: events.length, consensusRounds, retries, humanInterventions, autonomousDecisions, topAgent: topAgent.replace(/_/g, ' '), topCount }
  }, [events])

  const stats = [
    { icon: Cpu,         label: 'Agents Active',    value: metrics.agentsSpawned },
    { icon: Network,     label: 'Events Fired',     value: metrics.totalEvents },
    { icon: Users,       label: 'Consensus Rounds', value: metrics.consensusRounds },
    { icon: RotateCcw,   label: 'Retries',          value: metrics.retries },
    { icon: ShieldCheck, label: 'Auto Decisions',   value: metrics.autonomousDecisions },
    { icon: GitBranch,   label: 'Human Decisions',  value: metrics.humanInterventions },
  ]

  return (
    <div className="rounded-xl border border-white/6 bg-[rgb(var(--surface))] p-4">
      <p className="text-[10px] text-white/25 uppercase tracking-widest mb-3">Swarm Metrics</p>
      <div className="grid grid-cols-2 gap-2">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-2 rounded-lg bg-white/3 border border-white/6 px-2.5 py-2">
            <Icon className="h-3.5 w-3.5 text-white/25 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-white tabular-nums leading-none">{value}</div>
              <div className="text-[9px] text-white/30 uppercase tracking-widest mt-0.5 truncate">{label}</div>
            </div>
          </div>
        ))}
      </div>
      {metrics.topAgent && (
        <p className="text-[10px] text-white/25 mt-3 text-center">
          Most active: <span className="text-white/50 capitalize">{metrics.topAgent}</span>
          <span className="text-white/20 ml-1">({metrics.topCount} msgs)</span>
        </p>
      )}
    </div>
  )
}
