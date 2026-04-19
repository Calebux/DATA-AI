'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { formatRelative } from '@/lib/utils'
import type { WorkflowRun, Workflow, AgentEvent, AgentMemory } from '@/types'
import {
  X, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Clock, Server, Terminal, Box, FileText, Check, FileJson,
  Scale
} from 'lucide-react'

// ── Tab types ─────────────────────────────────────────────────────────────

type InspectorTab = 'tasks' | 'logs' 

interface Props {
  open: boolean
  run: WorkflowRun | null
  workflow: Workflow | null
  onClose: () => void
}

export default function RunInspectorDrawer({ open, run, workflow, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('tasks')
  const [loading, setLoading]     = useState(false)
  const [events, setEvents]       = useState<AgentEvent[]>([])
  const [memories, setMemories]   = useState<AgentMemory[]>([])
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  // Polling events while drawer is open
  useEffect(() => {
    if (!open || !run || !workflow) return
    let active = true

    async function load() {
      if (events.length === 0) setLoading(true)
      const supabase = getSupabase()
      
      const { data: evs } = await supabase
        .from('agent_events')
        .select('*')
        .eq('run_id', run!.id)
        .order('created_at', { ascending: true })

      const { data: mems } = await supabase
        .from('agent_memory')
        .select('*')
        .eq('run_id', run!.id)

      if (active) {
        if (evs) setEvents(evs as AgentEvent[])
        if (mems) setMemories(mems as AgentMemory[])
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 3000)
    return () => { active = false; clearInterval(interval) }
  }, [open, run?.id, workflow?.id])

  // Process states for each step
  const stepsData = (workflow?.definition.steps ?? []).map(step => {
    const stepEvents = events.filter(e => e.step_id === step.step_id)
    const stepMemories = memories.filter(m => m.step_id === step.step_id)
    
    const isStarted = stepEvents.some(e => e.event_type === 'TASK_ASSIGNED')
    const isComplete = stepEvents.some(e => e.event_type === 'TASK_COMPLETE')
    const errorEvent = stepEvents.find(e => e.event_type === 'AGENT_ERROR')
    
    let status: 'pending' | 'running' | 'completed' | 'failed' = 'pending'
    if (errorEvent) status = 'failed'
    else if (isComplete) status = 'completed'
    else if (isStarted) status = 'running'

    // Also consider it completed if overall run is complete and no errors
    if (status === 'pending' && run?.status === 'complete') status = 'completed'

    return {
      step,
      status,
      events: stepEvents,
      memories: stepMemories,
      error: errorEvent
    }
  })

  // Format payload helper
  function formatPayload(payload: any) {
    try {
      return JSON.stringify(payload, null, 2)
    } catch {
      return String(payload)
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      
      <div className={`fixed top-0 right-0 h-full z-50 w-full max-w-2xl bg-apple-gray shadow-2xl flex flex-col transition-transform duration-300 ease-in-out border-l border-black/5 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 glass-nav flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <code className="text-[10px] font-mono font-bold bg-white/10 px-1.5 py-0.5 rounded border border-white/20 text-white/80">
                {run?.id.split('-')[0]}
              </code>
              <Badge variant="muted" className={`text-[10px] tracking-tight font-medium border-transparent ${
                run?.status === 'running' ? 'bg-blue-500 text-white' :
                run?.status === 'complete' ? 'bg-green-500 text-white' :
                run?.status === 'failed' ? 'bg-red-500 text-white' : 'bg-white/10 text-white'
              }`}>
                {run?.status}
              </Badge>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">{workflow?.name}</h2>
            <p className="text-xs text-white/60 mt-0.5 flex items-center gap-1.5 font-medium">
              <Clock className="h-3 w-3" /> Started {run && formatRelative(run.triggered_at)}
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex glass-nav px-6 flex-shrink-0 sticky top-14 z-10 border-t border-white/5">
          <button onClick={() => setActiveTab('tasks')}
            className={`mr-6 pb-2.5 pt-1 text-[11px] font-bold transition-all border-b-2 -mb-px flex items-center gap-1.5 tracking-tight ${
              activeTab === 'tasks' ? 'text-white border-white' : 'text-white/40 border-transparent hover:text-white/70'
            }`}>
            <Box className="h-3.5 w-3.5" />
            Tasks
          </button>
          <button onClick={() => setActiveTab('logs')}
            className={`mr-6 pb-2.5 pt-1 text-[11px] font-bold transition-all border-b-2 -mb-px flex items-center gap-1.5 tracking-tight ${
              activeTab === 'logs' ? 'text-white border-white' : 'text-white/40 border-transparent hover:text-white/70'
            }`}>
            <Terminal className="h-3.5 w-3.5" />
            Stream
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-apple-gray">
          {loading && events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40">
              <Spinner className="text-black/20 mb-3" />
              <p className="text-xs text-black/40 font-mono tracking-widest uppercase">Fetching Trace</p>
            </div>
          ) : activeTab === 'tasks' ? (
            <div className="space-y-3 pb-8">
              {stepsData.map((data, idx) => {
                const isExpanded = expandedStep === data.step.step_id
                
                return (
                  <div key={data.step.step_id} className={`apple-card mb-4 transition-all overflow-hidden ${
                    data.status === 'running' ? 'ring-2 ring-apple-blue ring-offset-2 ring-offset-apple-gray' : ''
                  }`}>
                    {/* Step Header */}
                    <button 
                      onClick={() => setExpandedStep(isExpanded ? null : data.step.step_id)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-black/[0.01] transition-colors text-left"
                    >
                      {/* Status Icon */}
                      <div className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                        {data.status === 'completed' ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : data.status === 'failed' ? (
                          <AlertTriangle className="h-5 w-5 text-red-500" />
                        ) : data.status === 'running' ? (
                          <Spinner size="sm" className="text-blue-500" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-black/15" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold truncate ${data.status === 'pending' ? 'text-black/50' : 'text-black'}`}>
                            {data.step.step_id}
                          </span>
                          <span className="text-[10px] uppercase font-mono tracking-wider text-black/30 border border-black/10 px-1.5 py-[1px] rounded bg-black/5">
                            {data.step.agent_role}
                          </span>
                        </div>
                        <p className={`text-xs mt-0.5 truncate ${data.status === 'pending' ? 'text-black/30' : 'text-black/50'}`}>
                          {data.step.instructions}
                        </p>
                      </div>

                      <div className="flex-shrink-0 text-black/30">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                    </button>

                    {/* Step Details (Expanded) */}
                    {isExpanded && (
                      <div className="bg-black/5 border-t border-black/10 p-4 text-xs font-mono">
                        {data.events.length === 0 ? (
                          <p className="text-black/40 italic">Waiting to start...</p>
                        ) : (
                          <div className="space-y-4">
                            {/* Instruction Context */}
                            <div className="bg-white border text-black/60 border-black/10 p-3 rounded">
                              <span className="font-bold text-black uppercase tracking-widest text-[9px] mb-2 block">Instruction Trace</span>
                              {data.step.instructions}
                            </div>

                            {/* Consensus Visualization */}
                            {data.step.consensus && (
                              <div className="bg-white border border-black/10 p-3 rounded">
                                <span className="font-bold text-black uppercase tracking-widest text-[9px] mb-2 flex items-center gap-1.5">
                                  <Scale className="h-3 w-3" /> Consensus Evaluation
                                </span>
                                <div className="grid grid-cols-3 gap-2 mt-3">
                                  {data.events.filter(e => e.event_type === 'CONSENSUS_VOTE').map((vote, i) => {
                                    const p = vote.payload as any
                                    return (
                                      <div key={vote.id} className="border border-black/10 rounded overflow-hidden">
                                        <div className="bg-black/[0.03] px-2 py-1 border-b border-black/5 flex justify-between text-[9px] font-bold">
                                          <span>Agent {i + 1}</span>
                                          <span className="text-black/40">{(p.confidence * 100).toFixed(0)}% Conf</span>
                                        </div>
                                        <div className="p-2 bg-[#fafafa] text-[8px] text-black/60 overflow-x-auto max-h-24">
                                          <pre>{formatPayload(p.outputs).slice(0, 300)}</pre>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                                {data.events.find(e => e.event_type === 'CONSENSUS_RESOLVED') && (
                                  <div className="mt-3 bg-green-500/10 text-green-800 text-[10px] px-2 py-1 rounded border border-green-500/20 font-bold">
                                    Resolved via {data.step.consensus.reconciliation}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Event log */}
                            <div className="space-y-2">
                              {data.events.map(ev => (
                                <div key={ev.id} className="relative pl-4 border-l-2 border-black/10 py-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-bold text-black uppercase tracking-wider">{ev.event_type}</span>
                                    <span className="text-black/30 text-[10px]">{formatRelative(ev.created_at)}</span>
                                  </div>
                                  {Object.keys(ev.payload || {}).length > 0 && (
                                    <div className="bg-white border border-black/10 p-2 rounded mt-1 overflow-x-auto">
                                      <pre className="text-[10px] text-black/70 leading-relaxed">
                                        {formatPayload(ev.payload)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Memories/Outputs */}
                            {data.memories.length > 0 && (
                              <div className="pt-2">
                                <span className="font-bold text-black/40 uppercase tracking-widest text-[9px] mb-2 block flex items-center gap-1.5">
                                  <FileJson className="h-3 w-3" /> Generated Output Memory
                                </span>
                                {data.memories.map(mem => (
                                  <div key={mem.id} className="bg-blue-500/5 border border-blue-500/20 p-3 rounded text-blue-900 mt-2 overflow-x-auto">
                                    <pre className="text-[10px] leading-relaxed">
                                      {formatPayload(mem.output)}
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-[#1e1e1e] rounded-xl p-4 overflow-x-auto border border-black/20 shadow-inner">
              {events.length === 0 ? (
                <p className="text-white/30 text-xs font-mono">No events recorded yet.</p>
              ) : (
                <div className="space-y-1.5 font-mono text-[11px] leading-relaxed">
                  {events.map((ev, i) => (
                    <div key={ev.id} className="flex items-start gap-4 hover:bg-white/5 px-2 py-1 -mx-2 rounded transition-colors group">
                      <span className="text-white/30 flex-shrink-0 w-12 text-right">{String(i+1).padStart(2,'0')}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${
                            ev.event_type.includes('ERROR') ? 'text-red-400' :
                            ev.event_type.includes('COMPLETE') ? 'text-green-400' :
                            ev.event_type.includes('START') ? 'text-blue-400' : 'text-white/80'
                          }`}>
                            {ev.event_type}
                          </span>
                          <span className="text-white/40">from</span>
                          <span className="text-yellow-200/80">{ev.source_agent}</span>
                          {ev.step_id && (
                            <>
                              <span className="text-white/40">on step</span>
                              <span className="text-purple-300/80">{ev.step_id}</span>
                            </>
                          )}
                        </div>
                        {Object.keys(ev.payload || {}).length > 0 && (
                          <div className="text-white/50 mt-0.5 break-all opacity-50 group-hover:opacity-100 transition-opacity">
                            {formatPayload(ev.payload).slice(0, 200)}{formatPayload(ev.payload).length > 200 ? '...' : ''}
                          </div>
                        )}
                      </div>
                      <span className="text-white/20 whitespace-nowrap">{new Date(ev.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
