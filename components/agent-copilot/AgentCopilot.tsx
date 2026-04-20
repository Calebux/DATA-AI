'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { AgentEvent, AgentEventType } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { formatRelative } from '@/lib/utils'
import { AgentIcon, AGENT_LABEL } from '@/lib/agent-icons'

const EVENT_COLORS: Record<AgentEventType, string> = {
  START_WORKFLOW: 'default',
  TASK_ASSIGNED: 'default',
  TASK_COMPLETE: 'green',
  DATA_READY: 'green',
  ANALYSIS_READY: 'green',
  RESEARCH_COMPLETE: 'green',
  EVAL_PASS: 'green',
  EVAL_FAIL_RETRY: 'yellow',
  DELIVERY_SENT: 'green',
  WORKFLOW_COMPLETE: 'green',
  AGENT_ERROR: 'red',
  CONSENSUS_START: 'default',
  CONSENSUS_VOTE: 'yellow',
  CONSENSUS_RESOLVED: 'green',
  CRITIQUE_REQUESTED: 'yellow',
  CRITIQUE_FEEDBACK: 'yellow',
  CRITIQUE_APPROVED: 'green',
  ESCALATION_REQUESTED: 'yellow',
  HUMAN_APPROVED: 'green',
  HUMAN_REJECTED: 'red',
}


interface AgentCopilotProps {
  runId: string
  running?: boolean
}

export default function AgentCopilot({ runId, running }: AgentCopilotProps) {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = getSupabase()

    async function fetchEvents() {
      const { data } = await supabase
        .from('agent_events').select('*').eq('run_id', runId).order('created_at', { ascending: true })
      if (data) setEvents(data as AgentEvent[])
    }

    fetchEvents()
    const interval = setInterval(fetchEvents, 2000)
    return () => clearInterval(interval)
  }, [runId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/6">
        <span className="text-sm font-medium text-white">Agent Feed</span>
        {running && <Spinner size="sm" className="text-[rgb(var(--brand))]" />}
        <span className="ml-auto text-xs text-white/30">{events.length} events</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {events.length === 0 ? (
          <div className="text-center py-10 text-white/30 text-sm">
            {running ? 'Waiting for agents...' : 'No events yet'}
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="flex gap-3 text-sm">
              <div className="flex-shrink-0 mt-0.5 w-5 flex items-center justify-center">
                <AgentIcon role={event.source_agent} className="h-3.5 w-3.5 text-white/40" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white/50 text-xs capitalize">{AGENT_LABEL[event.source_agent] ?? event.source_agent.replace('_', ' ')}</span>
                  <Badge variant={EVENT_COLORS[event.event_type] as 'default' | 'green' | 'yellow' | 'red' | 'muted' ?? 'muted'}>
                    {event.event_type.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-white/25 text-xs ml-auto">{formatRelative(event.created_at)}</span>
                </div>
                {event.step_id && (
                  <p className="text-white/40 text-xs mt-0.5 font-mono">→ {event.step_id}</p>
                )}
                {event.event_type === 'CONSENSUS_VOTE' && event.payload?.confidence != null && (
                  <p className="text-amber-400/70 text-xs mt-0.5 font-mono">
                    vote {String(Number(event.payload.vote_index) + 1)}/{String(event.payload.agent_count)} · conf {Number(event.payload.confidence).toFixed(2)}
                  </p>
                )}
                {event.payload?.message != null && (
                  <p className="text-white/70 text-xs mt-1">{String(event.payload.message)}</p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
