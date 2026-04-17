'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { AgentEvent, AgentRole } from '@/types'
import { AGENT_ICON_MAP, AGENT_COLOR, AGENT_LABEL } from '@/lib/agent-icons'
import { Bot } from 'lucide-react'

// Agent node positions (cx=200 cy=150, r=105)
const AGENT_POSITIONS: Record<string, { x: number; y: number }> = {
  orchestrator:  { x: 200, y: 150 },
  data_ingestor: { x: 305, y:  78 },
  analyst:       { x: 333, y: 185 },
  eval:          { x: 262, y: 255 },
  delivery:      { x: 138, y: 255 },
  watcher:       { x:  67, y: 185 },
  escalator:     { x:  95, y:  78 },
}

const EVENT_EDGE_COLOR: Record<string, string> = {
  TASK_ASSIGNED:      '#6366f1',  // violet — orchestrator sends task
  TASK_COMPLETE:      '#22c55e',  // green — agent reports done
  DATA_READY:         '#22c55e',
  ANALYSIS_READY:     '#22c55e',
  EVAL_PASS:          '#22c55e',
  EVAL_FAIL_RETRY:    '#eab308',  // amber — retry
  CONSENSUS_START:    '#f59e0b',
  CONSENSUS_VOTE:     '#f59e0b',
  CONSENSUS_RESOLVED: '#22c55e',
  DELIVERY_SENT:      '#06b6d4',  // cyan
  AGENT_ERROR:        '#ef4444',  // red
  ESCALATION_REQUESTED: '#f97316',
  HUMAN_APPROVED:     '#22c55e',
  HUMAN_REJECTED:     '#ef4444',
  WORKFLOW_COMPLETE:  '#22c55e',
}

// Determine (from, to) from event
function edgeFromEvent(ev: AgentEvent): { from: string; to: string } | null {
  if (ev.target_agent) return { from: ev.source_agent, to: ev.target_agent }
  switch (ev.event_type) {
    case 'TASK_ASSIGNED':
      return ev.step_id ? { from: 'orchestrator', to: ev.source_agent } : null
    case 'TASK_COMPLETE':
    case 'DATA_READY':
    case 'ANALYSIS_READY':
    case 'EVAL_PASS':
    case 'EVAL_FAIL_RETRY':
    case 'DELIVERY_SENT':
    case 'AGENT_ERROR':
      return { from: ev.source_agent, to: 'orchestrator' }
    case 'CONSENSUS_START':
      return { from: 'orchestrator', to: ev.source_agent }
    case 'CONSENSUS_VOTE':
      return { from: ev.source_agent, to: 'orchestrator' }
    case 'CONSENSUS_RESOLVED':
      return { from: 'orchestrator', to: ev.source_agent }
    case 'ESCALATION_REQUESTED':
      return { from: ev.source_agent, to: 'escalator' }
    case 'HUMAN_APPROVED':
    case 'HUMAN_REJECTED':
      return { from: 'escalator', to: ev.source_agent }
    default:
      return null
  }
}

interface FlashEdge {
  id: string
  from: string
  to: string
  color: string
  t: number // 0→1 animation progress
}

interface Props {
  runId: string
  /** Replay mode: pre-sliced event list */
  replayEvents?: AgentEvent[]
}

export default function AgentCommsGraph({ runId, replayEvents }: Props) {
  const [liveEvents, setLiveEvents] = useState<AgentEvent[]>([])
  const [flashes, setFlashes] = useState<FlashEdge[]>([])
  const animRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null)
  const flashesRef = useRef<FlashEdge[]>([])

  // Sync ref so RAF closure can read latest
  useEffect(() => { flashesRef.current = flashes }, [flashes])

  useEffect(() => {
    if (replayEvents !== undefined) return
    const supabase = getSupabase()
    supabase.from('agent_events').select('*').eq('run_id', runId).order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setLiveEvents(data as AgentEvent[]) })

    const ch = supabase.channel(`comms:${runId}`)
      .on('broadcast', { event: 'agent_event' }, ({ payload }) => {
        const ev = { ...payload, id: crypto.randomUUID(), run_id: runId } as AgentEvent
        setLiveEvents(prev => [...prev, ev])
        triggerFlash(ev)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_events', filter: `run_id=eq.${runId}` },
        (p) => {
          const ev = p.new as AgentEvent
          setLiveEvents(prev => [...prev, ev])
          triggerFlash(ev)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [runId, replayEvents])

  // When replayEvents change, flash all of them once
  const prevReplayLen = useRef(0)
  useEffect(() => {
    if (replayEvents === undefined) return
    const newEvents = replayEvents.slice(prevReplayLen.current)
    prevReplayLen.current = replayEvents.length
    newEvents.forEach(ev => triggerFlash(ev))
  }, [replayEvents])

  function triggerFlash(ev: AgentEvent) {
    const edge = edgeFromEvent(ev)
    if (!edge) return
    const flash: FlashEdge = {
      id: Math.random().toString(36).slice(2),
      from: edge.from,
      to: edge.to,
      color: EVENT_EDGE_COLOR[ev.event_type] ?? '#ffffff',
      t: 0,
    }
    setFlashes(prev => [...prev.slice(-20), flash])
    startRAF()
  }

  function startRAF() {
    if (animRef.current !== null) return
    let last = performance.now()
    function tick(now: number) {
      const dt = (now - last) / 1000
      last = now
      setFlashes(prev => {
        const next = prev
          .map(f => ({ ...f, t: f.t + dt * 1.4 }))
          .filter(f => f.t < 1)
        if (next.length === 0) { animRef.current = null; return next }
        animRef.current = requestAnimationFrame(tick)
        return next
      })
    }
    animRef.current = requestAnimationFrame(tick)
  }

  const events = replayEvents ?? liveEvents

  // Count messages per directed edge for edge weight
  const edgeCounts: Record<string, number> = {}
  for (const ev of events) {
    const e = edgeFromEvent(ev)
    if (!e) continue
    const key = `${e.from}→${e.to}`
    edgeCounts[key] = (edgeCounts[key] ?? 0) + 1
  }

  const allRoles = Object.keys(AGENT_POSITIONS) as AgentRole[]

  return (
    <div className="rounded-xl border border-white/6 bg-[rgb(var(--surface))] overflow-hidden">
      <p className="text-[10px] text-white/25 uppercase tracking-widest px-4 pt-3 pb-0">
        Agent Communication Graph
      </p>
      <svg viewBox="0 0 400 300" className="w-full" style={{ maxHeight: 260 }}>
        {/* Static edges (faint background lines) */}
        {allRoles.filter(r => r !== 'orchestrator').map(role => {
          const from = AGENT_POSITIONS.orchestrator
          const to = AGENT_POSITIONS[role]
          if (!to) return null
          const fwdKey = `orchestrator→${role}`
          const bwdKey = `${role}→orchestrator`
          const weight = (edgeCounts[fwdKey] ?? 0) + (edgeCounts[bwdKey] ?? 0)
          return (
            <line
              key={role}
              x1={from.x} y1={from.y}
              x2={to.x} y2={to.y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={weight > 0 ? Math.min(1 + weight * 0.3, 3) : 1}
            />
          )
        })}

        {/* Animated flash arcs */}
        {flashes.map(flash => {
          const fromPos = AGENT_POSITIONS[flash.from]
          const toPos = AGENT_POSITIONS[flash.to]
          if (!fromPos || !toPos) return null

          // Interpolate position along the line
          const x = fromPos.x + (toPos.x - fromPos.x) * flash.t
          const y = fromPos.y + (toPos.y - fromPos.y) * flash.t
          const opacity = flash.t < 0.5 ? flash.t * 2 : (1 - flash.t) * 2

          return (
            <g key={flash.id}>
              {/* Trail line */}
              <line
                x1={fromPos.x + (toPos.x - fromPos.x) * Math.max(0, flash.t - 0.25)}
                y1={fromPos.y + (toPos.y - fromPos.y) * Math.max(0, flash.t - 0.25)}
                x2={x} y2={y}
                stroke={flash.color}
                strokeWidth={1.5}
                opacity={opacity * 0.6}
              />
              {/* Dot */}
              <circle cx={x} cy={y} r={3} fill={flash.color} opacity={opacity} />
            </g>
          )
        })}

        {/* Agent nodes */}
        {allRoles.map(role => {
          const pos = AGENT_POSITIONS[role]
          if (!pos) return null
          const isOrchestrator = role === 'orchestrator'
          const totalMsg = Object.entries(edgeCounts)
            .filter(([k]) => k.includes(role))
            .reduce((s, [, v]) => s + v, 0)
          const active = totalMsg > 0

          const colorClass = AGENT_COLOR[role] ?? 'text-white'
          // Extract the hex-ish color from the tailwind class for SVG stroke
          const strokeMap: Record<string, string> = {
            'text-violet-500': '#8b5cf6',
            'text-blue-500':   '#3b82f6',
            'text-amber-500':  '#f59e0b',
            'text-emerald-500':'#10b981',
            'text-cyan-500':   '#06b6d4',
            'text-slate-400':  '#94a3b8',
            'text-orange-500': '#f97316',
          }
          const stroke = strokeMap[colorClass] ?? '#ffffff'

          return (
            <g key={role}>
              {/* Glow ring if active */}
              {active && (
                <circle cx={pos.x} cy={pos.y} r={isOrchestrator ? 26 : 20}
                  fill="none" stroke={stroke} strokeWidth={1} opacity={0.2} />
              )}
              {/* Node circle */}
              <circle
                cx={pos.x} cy={pos.y}
                r={isOrchestrator ? 22 : 16}
                fill={`${stroke}18`}
                stroke={stroke}
                strokeWidth={isOrchestrator ? 1.5 : 1}
                opacity={active ? 1 : 0.35}
              />
              {/* Message count badge */}
              {totalMsg > 0 && (
                <text x={pos.x} y={pos.y + 2} textAnchor="middle" dominantBaseline="middle"
                  fontSize={isOrchestrator ? 11 : 9} fill={stroke} fontWeight="600" fontFamily="monospace">
                  {totalMsg}
                </text>
              )}
              {/* Label below */}
              <text
                x={pos.x} y={pos.y + (isOrchestrator ? 32 : 26)}
                textAnchor="middle" fontSize={8}
                fill={active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)'}
                fontFamily="sans-serif"
              >
                {AGENT_LABEL[role]?.toUpperCase() ?? role.replace(/_/g, ' ').toUpperCase()}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3">
        {[
          { color: '#6366f1', label: 'Assigned' },
          { color: '#22c55e', label: 'Complete' },
          { color: '#f59e0b', label: 'Consensus' },
          { color: '#f97316', label: 'Escalation' },
          { color: '#ef4444', label: 'Error' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            <span className="text-[9px] text-white/30 uppercase tracking-widest">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
