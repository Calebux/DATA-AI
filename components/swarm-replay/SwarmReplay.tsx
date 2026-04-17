'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { AgentEvent, WorkflowStep } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import SwarmVisualizer from '@/components/swarm-visualizer/SwarmVisualizer'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import { AgentIcon, AGENT_LABEL } from '@/lib/agent-icons'
const EVENT_VARIANT: Record<string, 'default' | 'green' | 'yellow' | 'red' | 'muted'> = {
  TASK_COMPLETE: 'green', EVAL_PASS: 'green', CONSENSUS_RESOLVED: 'green',
  DELIVERY_SENT: 'green', DATA_READY: 'green', ANALYSIS_READY: 'green',
  WORKFLOW_COMPLETE: 'green', EVAL_FAIL_RETRY: 'yellow', AGENT_ERROR: 'red',
  CONSENSUS_VOTE: 'yellow', ESCALATION_REQUESTED: 'yellow',
  HUMAN_APPROVED: 'green', HUMAN_REJECTED: 'red',
}

interface Props {
  runId: string
  steps: WorkflowStep[]
}

export default function SwarmReplay({ runId, steps }: Props) {
  const [allEvents, setAllEvents] = useState<AgentEvent[]>([])
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    supabase
      .from('agent_events').select('*').eq('run_id', runId).order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) { setAllEvents(data as AgentEvent[]); setPos(0) }
        setLoading(false)
      })
  }, [runId])

  // Auto-play interval
  useEffect(() => {
    if (!playing) { if (intervalRef.current) clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => {
      setPos(p => {
        if (p >= allEvents.length) { setPlaying(false); return p }
        return p + 1
      })
    }, 600)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, allEvents.length])

  if (loading) return (
    <div className="flex justify-center py-10">
      <Spinner size="sm" className="text-[rgb(var(--brand))]" />
    </div>
  )

  if (allEvents.length === 0) return (
    <p className="text-center py-10 text-white/30 text-sm">No events recorded for this run</p>
  )

  const slicedEvents = allEvents.slice(0, pos)
  const currentEvent = pos > 0 ? allEvents[pos - 1] : null

  return (
    <div className="space-y-4">
      {/* Visualizer in replay mode */}
      <div className="rounded-xl border border-white/6 bg-[rgb(var(--surface))] overflow-hidden">
        <SwarmVisualizer steps={steps} runId={runId} replayEvents={slicedEvents} />
      </div>

      {/* Current event detail */}
      <div className="rounded-lg border border-white/6 bg-[rgb(var(--surface-2))] px-4 py-3 min-h-[60px]">
        {currentEvent ? (
          <div className="flex items-start gap-3">
            <AgentIcon role={currentEvent.source_agent} className="h-4 w-4 text-white/40 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white/50 text-xs capitalize">{AGENT_LABEL[currentEvent.source_agent] ?? currentEvent.source_agent.replace(/_/g, ' ')}</span>
                <Badge variant={EVENT_VARIANT[currentEvent.event_type] ?? 'muted'}>
                  {currentEvent.event_type.replace(/_/g, ' ')}
                </Badge>
                {currentEvent.event_type === 'CONSENSUS_VOTE' && currentEvent.payload?.confidence != null && (
                  <span className="text-[10px] text-amber-400">
                    conf {Number(currentEvent.payload.confidence).toFixed(2)}
                  </span>
                )}
              </div>
              {currentEvent.step_id && (
                <p className="text-white/30 text-xs font-mono mt-0.5">→ {currentEvent.step_id}</p>
              )}
            </div>
            <span className="text-[10px] text-white/20 tabular-nums">{pos}/{allEvents.length}</span>
          </div>
        ) : (
          <p className="text-white/25 text-sm text-center">Press play or drag the slider to replay</p>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-2">
        <input
          type="range"
          min={0}
          max={allEvents.length}
          value={pos}
          onChange={e => { setPlaying(false); setPos(Number(e.target.value)) }}
          className="w-full accent-[rgb(var(--brand))] cursor-pointer"
        />
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => { setPlaying(false); setPos(0) }}
            className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
            title="Reset"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPlaying(p => !p)}
            className="p-2.5 rounded-lg bg-[rgb(var(--brand))]/15 hover:bg-[rgb(var(--brand))]/25 text-[rgb(var(--brand))] transition-colors"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={() => { setPlaying(false); setPos(allEvents.length) }}
            className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
            title="Jump to end"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
