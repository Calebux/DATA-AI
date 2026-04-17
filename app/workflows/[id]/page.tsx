'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Workflow, WorkflowRun } from '@/types'
import { Card } from '@/components/ui/card'
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
import { ArrowLeft, Play, Clock } from 'lucide-react'
import { formatRelative } from '@/lib/utils'

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

    // Realtime: update run status
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

  if (loading) return <div className="flex justify-center pt-20"><Spinner size="lg" className="text-[rgb(var(--brand))]" /></div>
  if (!workflow) return <p className="text-center py-20 text-white/40">Workflow not found</p>

  const activeRun = runs.find(r => r.id === activeRunId)
  const latestRun = runs[0]

  return (
    <div className="dark-section min-h-screen -mt-14 pt-14">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard" className="text-white/40 hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{workflow.name}</h1>
          <p className="text-sm text-white/40">{workflow.definition.steps.length} agents · {workflow.category.replace('_', ' ')}</p>
        </div>
        <Button onClick={() => setShowRunModal(true)}>
          <Play className="h-4 w-4" /> Run Now
        </Button>
      </div>

      {/* Escalation panel — shown when a run needs human approval */}
      {activeRunId && <EscalationPanel runId={activeRunId} />}

      {/* Live swarm visualizer — shown whenever a run is selected */}
      {activeRunId && (
        <Card className="p-0 overflow-hidden mb-4">
          <p className="text-[10px] text-white/25 uppercase tracking-widest px-4 pt-3 pb-0">
            Execution Map
          </p>
          <SwarmVisualizer
            steps={workflow.definition.steps}
            runId={activeRunId}
            running={activeRun?.status === 'running'}
          />
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main panel */}
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

            <TabsContent value="overview">
              <Card className="space-y-4">
                <p className="text-sm text-white/50">{workflow.description}</p>
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Agent Pipeline</p>
                  <div className="space-y-1">
                    {workflow.definition.steps.map((step, i) => (
                      <div key={step.step_id} className="flex items-center gap-2 text-sm">
                        <span className="text-white/20 w-5 text-right">{i + 1}</span>
                        <span className="font-mono text-white/60">{step.step_id}</span>
                        <Badge variant="muted" className="text-[10px]">{step.agent_role}</Badge>
                        {step.consensus && <Badge variant="default" className="text-[10px]">×{step.consensus.agent_count} consensus</Badge>}
                        {step.depends_on.length > 0 && (
                          <span className="text-white/20 text-xs ml-auto">← {step.depends_on.join(', ')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </TabsContent>

            {activeRunId && (
              <TabsContent value="live">
                <Card className="p-0 overflow-hidden h-96">
                  <AgentCopilot runId={activeRunId} running={activeRun?.status === 'running'} />
                </Card>
              </TabsContent>
            )}

            {activeRunId && (
              <TabsContent value="replay">
                <Card>
                  <SwarmReplay runId={activeRunId} steps={workflow.definition.steps} />
                </Card>
              </TabsContent>
            )}

            {activeRunId && (
              <TabsContent value="consensus">
                <Card>
                  <ConsensusLog runId={activeRunId} />
                </Card>
              </TabsContent>
            )}

            {activeRunId && (
              <TabsContent value="comms">
                <AgentCommsGraph runId={activeRunId} />
              </TabsContent>
            )}

            <TabsContent value="history">
              <div className="space-y-2">
                {runs.length === 0 ? (
                  <p className="text-white/30 text-sm text-center py-10">No runs yet</p>
                ) : (
                  runs.map(run => (
                    <button
                      key={run.id}
                      onClick={() => setActiveRunId(run.id)}
                      className={`w-full flex items-center gap-3 rounded-xl p-3 text-sm transition-colors text-left ${activeRunId === run.id ? 'bg-[rgb(var(--brand))]/8 border border-[rgb(var(--brand))]/20' : 'bg-[rgb(var(--surface))] border border-white/6 hover:border-white/10'}`}
                    >
                      <Clock className="h-4 w-4 text-white/30 flex-shrink-0" />
                      <span className="text-white/60 flex-1">{formatRelative(run.triggered_at)}</span>
                      <Badge variant={RUN_BADGE[run.status]}>{run.status}</Badge>
                      {run.quality_score != null && (
                        <span className="text-white/30 text-xs">{(run.quality_score * 10).toFixed(1)}/10</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="triggers">
              <Card>
                <WebhookExecutor workflowId={workflow.id} />
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Latest Run</p>
            {latestRun ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant={RUN_BADGE[latestRun.status]}>{latestRun.status}</Badge>
                  {latestRun.quality_score != null && (
                    <span className="text-sm text-white">{(latestRun.quality_score * 10).toFixed(1)}/10</span>
                  )}
                </div>
                <p className="text-xs text-white/40">{formatRelative(latestRun.triggered_at)}</p>
                {latestRun.error_message && <p className="text-xs text-red-400">{latestRun.error_message}</p>}
              </div>
            ) : (
              <p className="text-sm text-white/30">No runs yet</p>
            )}
          </Card>

          {(activeRun ?? latestRun) && (
            <Card>
              <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Run Stats</p>
              <RunStats run={(activeRun ?? latestRun)!} />
            </Card>
          )}

          <Card>
            <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Trigger</p>
            <p className="text-sm text-white capitalize">{workflow.definition.trigger.type.replace('_', ' ')}</p>
            {workflow.definition.trigger.cron_expression && (
              <p className="text-xs text-white/40 font-mono mt-1">{workflow.definition.trigger.cron_expression}</p>
            )}
          </Card>

          <Card>
            <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Output Channels</p>
            <div className="flex flex-wrap gap-1.5">
              {workflow.definition.output.channels.map((ch, i) => (
                <Badge key={i} variant="muted">{ch.type}</Badge>
              ))}
            </div>
          </Card>

          {activeRunId && <SwarmMetrics runId={activeRunId} />}

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
    </div>
    </div>
  )
}
