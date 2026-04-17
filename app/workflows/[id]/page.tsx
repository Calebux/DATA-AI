'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Workflow, WorkflowRun } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import AgentCopilot from '@/components/agent-copilot/AgentCopilot'
import OrchestratorModal from '@/components/orchestrator-modal/OrchestratorModal'
import WebhookExecutor from '@/components/webhook-executor/WebhookExecutor'
import ReportRenderer from '@/components/report-renderer/ReportRenderer'
import SwarmVisualizer from '@/components/swarm-visualizer/SwarmVisualizer'
import SwarmReplay from '@/components/swarm-replay/SwarmReplay'
import RunStats from '@/components/run-stats/RunStats'
import ConsensusLog from '@/components/consensus-log/ConsensusLog'
import EscalationPanel from '@/components/escalation-panel/EscalationPanel'
import DemoComparison from '@/components/demo-comparison/DemoComparison'
import AgentCommsGraph from '@/components/agent-comms-graph/AgentCommsGraph'
import SwarmMetrics from '@/components/swarm-metrics/SwarmMetrics'
import Link from 'next/link'
import { ArrowLeft, Play, Clock, Settings2 } from 'lucide-react'
import { formatRelative } from '@/lib/utils'
import WorkflowEditDrawer from '@/components/workflow-builder/WorkflowEditDrawer'

const RUN_BADGE = { running: 'default', complete: 'green', failed: 'red' } as const

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(searchParams.get('run'))
  const [loading, setLoading] = useState(true)
  const [showRunModal, setShowRunModal] = useState(false)
  const [showEditDrawer, setShowEditDrawer] = useState(false)

  useEffect(() => {
    if (!user || !id) return
    const supabase = getSupabase()

    async function load() {
      const [{ data: wf }, { data: runData }] = await Promise.all([
        supabase.from('workflows').select('*').eq('id', id).single(),
        supabase.from('workflow_runs').select('*').eq('workflow_id', id).order('triggered_at', { ascending: false }).limit(20),
      ])
      if (wf) setWorkflow(wf as Workflow)
      if (runData) setRuns(runData as WorkflowRun[])
      setLoading(false)
    }

    load()

    const sub = supabase
      .channel(`wf-runs-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_runs', filter: `workflow_id=eq.${id}` }, payload => {
        setRuns(prev => {
          const existing = prev.findIndex(r => r.id === (payload.new as WorkflowRun).id)
          if (existing >= 0) {
            const updated = [...prev]
            updated[existing] = payload.new as WorkflowRun
            return updated
          }
          return [payload.new as WorkflowRun, ...prev]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [user, id])

  if (loading) return <div className="flex justify-center pt-28"><Spinner size="lg" className="text-black/30" /></div>
  if (!workflow) return <p className="text-center py-28 text-black/40">Workflow not found</p>

  const activeRun = runs.find(r => r.id === activeRunId)
  const latestRun = runs[0]

  return (
    <div className="min-h-screen -mt-14 pt-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8 pb-6 border-b border-black/8">
          <Link href="/dashboard" className="text-black/35 hover:text-black transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-black tracking-tight">{workflow.name}</h1>
            <p className="text-sm text-black/40 mt-0.5">
              {workflow.definition.steps.length} agents · {workflow.category.replace('_', ' ')}
            </p>
          </div>
          <button
            onClick={() => setShowEditDrawer(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-black/12 text-[10px] tracking-[0.12em] uppercase text-black/45 hover:text-black hover:border-black/30 transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" /> Edit
          </button>
          <Button onClick={() => setShowRunModal(true)}>
            <Play className="h-4 w-4" /> Run Now
          </Button>
        </div>

        {/* Escalation panel — dark execution context */}
        {activeRunId && (
          <div className="dark-section rounded-xl mb-4">
            <EscalationPanel runId={activeRunId} />
          </div>
        )}

        {/* Swarm visualizer — dark execution context */}
        {activeRunId && (
          <div className="dark-section rounded-xl overflow-hidden mb-6">
            <p className="text-[10px] text-white/25 uppercase tracking-widest px-4 pt-3 pb-0">
              Execution Map
            </p>
            <SwarmVisualizer
              steps={workflow.definition.steps}
              runId={activeRunId}
              running={activeRun?.status === 'running'}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Main panel ── */}
          <div className="lg:col-span-2">
            <Tabs defaultValue={activeRunId ? 'live' : 'overview'}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                {activeRunId && <TabsTrigger value="live">Feed</TabsTrigger>}
                <TabsTrigger value="history">History</TabsTrigger>
                {activeRunId && <TabsTrigger value="replay">Replay</TabsTrigger>}
                {activeRunId && <TabsTrigger value="consensus">Consensus</TabsTrigger>}
                {activeRunId && <TabsTrigger value="comms">Comms</TabsTrigger>}
                <TabsTrigger value="triggers">Triggers</TabsTrigger>
              </TabsList>

              {/* Overview — light card */}
              <TabsContent value="overview">
                <div className="bg-white border border-black/8 rounded-xl p-5 space-y-5">
                  {workflow.description && (
                    <p className="text-sm text-black/50 leading-relaxed">{workflow.description}</p>
                  )}
                  <div>
                    <p className="section-label mb-3">Agent Pipeline</p>
                    <div className="space-y-1.5">
                      {workflow.definition.steps.map((step, i) => (
                        <div key={step.step_id} className="flex items-center gap-2 text-sm py-1.5 border-b border-black/5 last:border-0">
                          <span className="row-num">{i + 1}</span>
                          <span className="font-mono text-black/60 text-xs flex-1">{step.step_id}</span>
                          <Badge variant="muted" className="text-[10px]">{step.agent_role}</Badge>
                          {step.consensus && (
                            <Badge variant="default" className="text-[10px]">×{step.consensus.agent_count} consensus</Badge>
                          )}
                          {step.depends_on.length > 0 && (
                            <span className="text-black/20 text-xs ml-auto hidden sm:block">← {step.depends_on.join(', ')}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Live feed — dark execution context */}
              {activeRunId && (
                <TabsContent value="live">
                  <div className="dark-section rounded-xl overflow-hidden h-96">
                    <AgentCopilot runId={activeRunId} running={activeRun?.status === 'running'} />
                  </div>
                </TabsContent>
              )}

              {/* History — light list */}
              <TabsContent value="history">
                <div className="space-y-2">
                  {runs.length === 0 ? (
                    <p className="text-black/30 text-sm text-center py-10">No runs yet</p>
                  ) : (
                    runs.map(run => (
                      <button
                        key={run.id}
                        onClick={() => setActiveRunId(run.id)}
                        className={`w-full flex items-center gap-3 rounded-xl p-3 text-sm transition-colors text-left border ${
                          activeRunId === run.id
                            ? 'bg-black border-black text-white'
                            : 'bg-white border-black/8 hover:border-black/20'
                        }`}
                      >
                        <Clock className={`h-4 w-4 flex-shrink-0 ${activeRunId === run.id ? 'text-white/40' : 'text-black/30'}`} />
                        <span className={`flex-1 ${activeRunId === run.id ? 'text-white/70' : 'text-black/55'}`}>
                          {formatRelative(run.triggered_at)}
                        </span>
                        <Badge variant={RUN_BADGE[run.status]}>{run.status}</Badge>
                        {run.quality_score != null && (
                          <span className={`text-xs ${activeRunId === run.id ? 'text-white/30' : 'text-black/30'}`}>
                            {(run.quality_score * 10).toFixed(1)}/10
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </TabsContent>

              {/* Replay — dark */}
              {activeRunId && (
                <TabsContent value="replay">
                  <div className="dark-section rounded-xl overflow-hidden p-5">
                    <SwarmReplay runId={activeRunId} steps={workflow.definition.steps} />
                  </div>
                </TabsContent>
              )}

              {/* Consensus — dark */}
              {activeRunId && (
                <TabsContent value="consensus">
                  <div className="dark-section rounded-xl overflow-hidden p-5">
                    <ConsensusLog runId={activeRunId} />
                  </div>
                </TabsContent>
              )}

              {/* Comms graph — dark */}
              {activeRunId && (
                <TabsContent value="comms">
                  <AgentCommsGraph runId={activeRunId} />
                </TabsContent>
              )}

              {/* Triggers — light */}
              <TabsContent value="triggers">
                <div className="bg-white border border-black/8 rounded-xl p-5">
                  <WebhookExecutor workflowId={workflow.id} />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-4">

            {/* Latest Run — light card */}
            <div className="bg-white border border-black/8 rounded-xl p-5">
              <p className="section-label mb-3">Latest Run</p>
              {latestRun ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant={RUN_BADGE[latestRun.status]}>{latestRun.status}</Badge>
                    {latestRun.quality_score != null && (
                      <span className="text-sm font-semibold text-black">
                        {(latestRun.quality_score * 10).toFixed(1)}/10
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-black/40">{formatRelative(latestRun.triggered_at)}</p>
                  {latestRun.error_message && (
                    <p className="text-xs text-red-600 mt-1">{latestRun.error_message}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-black/30">No runs yet</p>
              )}
            </div>

            {/* Run Stats — dark execution context */}
            {(activeRun ?? latestRun) && (
              <div className="dark-section rounded-xl overflow-hidden p-5">
                <p className="text-[10px] text-white/25 uppercase tracking-widest mb-3">Run Stats</p>
                <RunStats run={(activeRun ?? latestRun)!} />
              </div>
            )}

            {/* Trigger — light card */}
            <div className="bg-white border border-black/8 rounded-xl p-5">
              <p className="section-label mb-2">Trigger</p>
              <p className="text-sm text-black font-medium capitalize">
                {workflow.definition.trigger.type.replace('_', ' ')}
              </p>
              {workflow.definition.trigger.cron_expression && (
                <p className="text-xs text-black/40 font-mono mt-1">
                  {workflow.definition.trigger.cron_expression}
                </p>
              )}
            </div>

            {/* Output Channels — light card */}
            <div className="bg-white border border-black/8 rounded-xl p-5">
              <p className="section-label mb-3">Output Channels</p>
              <div className="flex flex-wrap gap-1.5">
                {workflow.definition.output.channels.map((ch, i) => (
                  <Badge key={i} variant="muted">{ch.type}</Badge>
                ))}
              </div>
            </div>

            {/* Swarm Metrics — dark */}
            {activeRunId && <SwarmMetrics runId={activeRunId} />}

            {/* Demo Comparison — dark */}
            <DemoComparison />

          </div>
        </div>

        {showRunModal && (
          <OrchestratorModal
            open
            workflow={workflow}
            onClose={() => setShowRunModal(false)}
            onRunStarted={runId => { setActiveRunId(runId); setShowRunModal(false) }}
          />
        )}

        <WorkflowEditDrawer
          open={showEditDrawer}
          workflow={workflow}
          onClose={() => setShowEditDrawer(false)}
          onSaved={updated => setWorkflow(updated)}
        />
      </div>
    </div>
  )
}
