'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { AgentEvent, AgentEventType, WorkflowStep } from '@/types'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, CheckCircle2 } from 'lucide-react'
import { AgentIcon } from '@/lib/agent-icons'

type StepStatus = 'pending' | 'running' | 'consensus' | 'complete' | 'failed' | 'retrying' | 'escalating'

interface StepState {
  status: StepStatus
  consensusCount?: number
  consensusVotes?: number
}


const STATUS_RING: Record<StepStatus, string> = {
  pending:    'border-white/8 bg-[rgb(var(--surface))] opacity-40',
  running:    'border-[rgb(var(--brand))]/50 bg-[rgb(var(--brand))]/8 animate-pulse',
  consensus:  'border-amber-500/50 bg-amber-500/8',
  complete:   'border-[rgb(var(--green))]/40 bg-[rgb(var(--green))]/8',
  failed:     'border-[rgb(var(--red))]/50 bg-[rgb(var(--red))]/8',
  retrying:   'border-[rgb(var(--yellow))]/50 bg-[rgb(var(--yellow))]/8',
  escalating: 'border-orange-500/50 bg-orange-500/8 animate-pulse',
}

const DOT_COLOR: Record<StepStatus, string> = {
  pending:    'bg-white/20',
  running:    'bg-[rgb(var(--brand))] animate-pulse',
  consensus:  'bg-amber-400',
  complete:   'bg-[rgb(var(--green))]',
  failed:     'bg-[rgb(var(--red))]',
  retrying:   'bg-[rgb(var(--yellow))]',
  escalating: 'bg-orange-400 animate-pulse',
}

const COMPLETE_EVENTS = new Set<AgentEventType>([
  'TASK_COMPLETE', 'DATA_READY', 'ANALYSIS_READY',
  'EVAL_PASS', 'DELIVERY_SENT', 'CONSENSUS_RESOLVED',
])

function buildPhases(steps: WorkflowStep[]): WorkflowStep[][] {
  const resolved = new Set<string>()
  const phases: WorkflowStep[][] = []
  let remaining = [...steps]
  while (remaining.length > 0) {
    const ready = remaining.filter(s => s.depends_on.every(d => resolved.has(d)))
    if (!ready.length) break
    phases.push(ready)
    ready.forEach(s => resolved.add(s.step_id))
    remaining = remaining.filter(s => !ready.includes(s))
  }
  return phases
}

function eventsToStates(events: AgentEvent[]): Record<string, StepState> {
  const states: Record<string, StepState> = {}
  for (const ev of events) {
    if (!ev.step_id) continue
    const s = ev.step_id
    if (!states[s]) states[s] = { status: 'pending' }
    switch (ev.event_type) {
      case 'TASK_ASSIGNED':
        states[s].status = 'running'
        break
      case 'CONSENSUS_START':
        states[s].status = 'consensus'
        states[s].consensusCount = ev.payload.agent_count as number
        states[s].consensusVotes = 0
        break
      case 'CONSENSUS_VOTE':
        states[s].consensusVotes = (states[s].consensusVotes ?? 0) + 1
        break
      case 'ESCALATION_REQUESTED':
        states[s].status = 'escalating'
        break
      case 'HUMAN_APPROVED':
      case 'HUMAN_REJECTED':
        states[s].status = 'running'
        break
      case 'EVAL_FAIL_RETRY':
        states[s].status = 'retrying'
        break
      case 'AGENT_ERROR':
        states[s].status = 'failed'
        break
      default:
        if (COMPLETE_EVENTS.has(ev.event_type)) states[s].status = 'complete'
    }
  }
  return states
}

interface Props {
  steps: WorkflowStep[]
  runId: string
  running?: boolean
  /** Replay mode: pass a pre-sliced event list instead of subscribing live */
  replayEvents?: AgentEvent[]
}

export default function SwarmVisualizer({ steps, runId, running, replayEvents }: Props) {
  const [liveEvents, setLiveEvents] = useState<AgentEvent[]>([])

  useEffect(() => {
    if (replayEvents !== undefined) return
    const supabase = getSupabase()
    supabase
      .from('agent_events').select('*').eq('run_id', runId).order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setLiveEvents(data as AgentEvent[]) })

    const ch = supabase.channel(`viz:${runId}`)
      .on('broadcast', { event: 'agent_event' }, ({ payload }) => {
        setLiveEvents(prev => [...prev, { ...payload, id: crypto.randomUUID(), run_id: runId } as AgentEvent])
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_events', filter: `run_id=eq.${runId}` },
        (p) => setLiveEvents(prev => [...prev, p.new as AgentEvent])
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [runId, replayEvents])

  const events = replayEvents ?? liveEvents
  const phases = useMemo(() => buildPhases(steps), [steps])
  const states = useMemo(() => eventsToStates(events), [events])
  const done = events.some(e => e.event_type === 'WORKFLOW_COMPLETE')

  return (
    <div className="flex items-start gap-1.5 overflow-x-auto p-4 min-h-[140px]">
      {phases.flatMap((phase, pi) => {
        const nodes = (
          <div key={`phase-${pi}`} className="flex flex-col gap-2 flex-shrink-0">
            <p className="text-[9px] text-white/20 uppercase tracking-widest text-center mb-0.5">
              Phase {pi + 1}
            </p>
            {phase.map(step => {
              const state = states[step.step_id] ?? { status: 'pending' as const }
              return (
                <div
                  key={step.step_id}
                  className={`rounded-lg border px-3 py-2 min-w-[128px] transition-all duration-500 ${STATUS_RING[state.status]}`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <AgentIcon role={step.agent_role} className="h-3.5 w-3.5 text-white/50 flex-shrink-0" />
                    <span className="text-[11px] text-white/70 font-medium truncate leading-none">
                      {step.step_id.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_COLOR[state.status]}`} />
                    <span className="text-[10px] text-white/40 capitalize flex-1">{state.status}</span>
                    {step.consensus && (
                      <Badge
                        variant={state.status === 'complete' ? 'green' : 'muted'}
                        className="text-[9px] px-1 py-0"
                      >
                        {state.status === 'consensus'
                          ? `${state.consensusVotes ?? 0}/${step.consensus.agent_count}`
                          : `×${step.consensus.agent_count}`
                        }
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )

        if (pi === 0) return [nodes]
        return [
          <div key={`arrow-${pi}`} className="flex items-center self-stretch mt-6 flex-shrink-0">
            <ChevronRight className="h-3.5 w-3.5 text-white/15" />
          </div>,
          nodes,
        ]
      })}

      {done && (
        <>
          <div className="flex items-center self-stretch mt-6 flex-shrink-0">
            <ChevronRight className="h-3.5 w-3.5 text-[rgb(var(--green))]/40" />
          </div>
          <div className="flex items-center self-stretch flex-shrink-0 mt-5">
            <div className="rounded-lg border border-[rgb(var(--green))]/30 bg-[rgb(var(--green))]/8 px-3 py-2 text-center min-w-[72px]">
              <CheckCircle2 className="h-5 w-5 text-[rgb(var(--green))] mx-auto" />
              <div className="text-[10px] text-[rgb(var(--green))] mt-1 font-medium">Done</div>
            </div>
          </div>
        </>
      )}

      {running && !done && (
        <div className="flex items-center self-stretch mt-6 ml-2 flex-shrink-0">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-[rgb(var(--brand))]/50 animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
