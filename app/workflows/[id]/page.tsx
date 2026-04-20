'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Workflow, WorkflowRun, Report, AgentEvent } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import AgentCopilot from '@/components/agent-copilot/AgentCopilot'
import OrchestratorModal from '@/components/orchestrator-modal/OrchestratorModal'
import ReportRenderer from '@/components/report-renderer/ReportRenderer'
import WorkflowEditDrawer from '@/components/workflow-builder/WorkflowEditDrawer'
import Link from 'next/link'
import { ArrowLeft, Play, CheckCircle2, Circle, Loader2, XCircle, Settings2, Clock } from 'lucide-react'
import { formatRelative } from '@/lib/utils'
import { AgentIcon } from '@/lib/agent-icons'

const RUN_BADGE = { running: 'default', complete: 'green', failed: 'red' } as const

// ── Simple step status derived from agent_events ──────────────────────────────

type StepStatus = 'pending' | 'running' | 'complete' | 'failed'

function deriveStepStatuses(events: AgentEvent[], stepIds: string[], runDone: boolean): Record<string, StepStatus> {
  const statuses: Record<string, StepStatus> = {}
  for (const id of stepIds) statuses[id] = 'pending'
  for (const ev of events) {
    if (!ev.step_id) continue
    if (ev.event_type === 'TASK_ASSIGNED') statuses[ev.step_id] = 'running'
    if (['TASK_COMPLETE','DATA_READY','ANALYSIS_READY','RESEARCH_COMPLETE','EVAL_PASS','DELIVERY_SENT','CONSENSUS_RESOLVED'].includes(ev.event_type))
      statuses[ev.step_id] = 'complete'
    if (ev.event_type === 'AGENT_ERROR') statuses[ev.step_id] = 'failed'
  }
  // If run is done but step is still "running", it failed silently
  if (runDone) {
    for (const id of stepIds) {
      if (statuses[id] === 'running') statuses[id] = 'failed'
    }
  }
  return statuses
}

function StepStatusIcon({ status }: { status: StepStatus }) {
  if (status === 'complete') return <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
  if (status === 'running')  return <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
  if (status === 'failed')   return <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
  return <Circle className="h-4 w-4 text-black/20 flex-shrink-0" />
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const { user } = useAuth()

  const [workflow,       setWorkflow]       = useState<Workflow | null>(null)
  const [runs,           setRuns]           = useState<WorkflowRun[]>([])
  const [activeRunId,    setActiveRunId]    = useState<string | null>(searchParams.get('run'))
  const [events,         setEvents]         = useState<AgentEvent[]>([])
  const [report,         setReport]         = useState<Report | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [showRunModal,   setShowRunModal]   = useState(false)
  const [showEditDrawer, setShowEditDrawer] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Load workflow + runs ──────────────────────────────────────────────────

  useEffect(() => {
    if (!user || !id) return
    const supabase = getSupabase()

    async function load() {
      const [{ data: wf }, { data: runData }] = await Promise.all([
        supabase.from('workflows').select('*').eq('id', id).single(),
        supabase.from('workflow_runs').select('*').eq('workflow_id', id)
          .order('triggered_at', { ascending: false }).limit(20),
      ])
      if (wf) setWorkflow(wf as Workflow)
      if (runData) {
        setRuns(runData as WorkflowRun[])
        if (!searchParams.get('run') && runData[0]) setActiveRunId(runData[0].id)
      }
      setLoading(false)
    }
    load()
  }, [user, id])

  // ── Poll run status + events every 3s while running ───────────────────────

  const pollRun = useCallback(async () => {
    if (!activeRunId) return
    const supabase = getSupabase()
    const [{ data: runData }, { data: evData }, { data: repData }] = await Promise.all([
      supabase.from('workflow_runs').select('*').eq('id', activeRunId).single(),
      supabase.from('agent_events').select('*').eq('run_id', activeRunId).order('created_at', { ascending: true }),
      supabase.from('reports').select('*').eq('run_id', activeRunId).order('created_at', { ascending: false }).limit(1),
    ])
    if (runData) setRuns(prev => {
      const idx = prev.findIndex(r => r.id === activeRunId)
      if (idx >= 0) { const u = [...prev]; u[idx] = runData as WorkflowRun; return u }
      return [runData as WorkflowRun, ...prev]
    })
    if (evData) setEvents(evData as AgentEvent[])
    if (repData?.[0]) setReport(repData[0] as Report)

    // Stop polling once complete or failed
    if (runData?.status === 'complete' || runData?.status === 'failed') {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [activeRunId])

  useEffect(() => {
    if (!activeRunId) return
    setEvents([])
    setReport(null)
    pollRun() // immediate first load
    pollRef.current = setInterval(pollRun, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeRunId, pollRun])

  // ── Export helpers ────────────────────────────────────────────────────────

  function exportReportPdf() {
    if (!report) return
    const sections = (report.content as Record<string, unknown>).report as Record<string, string> | undefined
    if (!sections) return
    const html = Object.entries(sections)
      .map(([k, v]) => `<h2 style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-top:1.5rem">${k.replace(/_/g,' ')}</h2><p style="white-space:pre-wrap;line-height:1.7">${v}</p>`)
      .join('')
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>${report.title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:2rem 3rem;max-width:800px;margin:0 auto;color:#1d1d1f}</style></head><body><h1 style="font-size:20px;margin-bottom:0.25rem">${report.title}</h1>${html}</body></html>`)
    w.document.close(); w.print()
  }

  function exportReportText() {
    if (!report) return
    const sections = (report.content as Record<string, unknown>).report as Record<string, string> | undefined
    if (!sections) return
    const text = Object.entries(sections).map(([k, v]) => `## ${k.toUpperCase().replace(/_/g,' ')}\n\n${v}`).join('\n\n---\n\n')
    const blob = new Blob([`# ${report.title}\n\n${text}`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${report.title}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex justify-center pt-28"><Spinner size="lg" className="text-black/30" /></div>
  if (!workflow) return <p className="text-center py-28 text-black/40">Workflow not found</p>

  const activeRun = runs.find(r => r.id === activeRunId) ?? runs[0] ?? null
  const isRunning = activeRun?.status === 'running'
  const stepIds = workflow.definition.steps.map(s => s.step_id)
  const runDone = activeRun?.status === 'complete' || activeRun?.status === 'failed'
  const stepStatuses = deriveStepStatuses(events, stepIds, !!runDone)

  return (
    <div className="min-h-screen -mt-14 pt-14">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">

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

        {/* ── Step progress strip ───────────────────────────────────────── */}
        <div className="bg-white border border-black/8 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-black/40">Agent Pipeline</p>
            {activeRun && (
              <div className="flex items-center gap-2">
                <Badge variant={RUN_BADGE[activeRun.status]}>{activeRun.status}</Badge>
                {activeRun.quality_score != null && (
                  <span className="text-xs text-black/50 font-medium">{(activeRun.quality_score * 10).toFixed(1)}/10</span>
                )}
                {isRunning && <Spinner size="sm" className="text-black/30" />}
              </div>
            )}
          </div>
          <div className="space-y-2">
            {workflow.definition.steps.map(step => {
              const status = stepStatuses[step.step_id] ?? 'pending'
              return (
                <div key={step.step_id} className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                  status === 'running' ? 'bg-blue-50 border border-blue-100' :
                  status === 'complete' ? 'bg-green-50 border border-green-100' :
                  status === 'failed' ? 'bg-red-50 border border-red-100' :
                  'bg-black/[0.02] border border-transparent'
                }`}>
                  <StepStatusIcon status={status} />
                  <AgentIcon role={step.agent_role} className="h-3.5 w-3.5 text-black/30 flex-shrink-0" />
                  <span className="text-sm text-black/70 font-mono flex-1">{step.step_id.replace(/_/g, ' ')}</span>
                  <Badge variant="muted" className="text-[10px]">{step.agent_role}</Badge>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Tabs defaultValue="report">
              <TabsList>
                <TabsTrigger value="report">Report</TabsTrigger>
                <TabsTrigger value="feed">Feed</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              {/* Report */}
              <TabsContent value="report">
                <div className="bg-white border border-black/8 rounded-xl p-5 min-h-[200px]">
                  {report ? (
                    <ReportRenderer
                      report={{
                        ...(report.content as Record<string, unknown>).report as Record<string, unknown>,
                        eval_result: (report.content as Record<string, unknown>).eval_result,
                      }}
                      title={report.title}
                      onExportPdf={exportReportPdf}
                      onExportXlsx={exportReportText}
                    />
                  ) : isRunning ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Spinner size="lg" className="text-black/20" />
                      <p className="text-sm text-black/40">Agents are working — report will appear here when done</p>
                    </div>
                  ) : activeRun?.status === 'failed' ? (
                    <div className="text-center py-12">
                      <p className="text-sm font-medium text-red-500 mb-2">Run failed</p>
                      <p className="text-xs text-black/40 font-mono max-w-md mx-auto leading-relaxed">
                        {activeRun.error_message ?? 'Check the Feed tab for agent error details'}
                      </p>
                    </div>
                  ) : activeRun?.status === 'complete' ? (
                    <div className="text-center py-12">
                      <p className="text-sm font-medium text-black/50 mb-1">Run completed — no report generated</p>
                      <p className="text-xs text-black/30 max-w-xs mx-auto leading-relaxed">
                        Check the <strong>Feed</strong> tab for agent errors. Most likely the data source URL was not configured.
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-sm text-black/30">No runs yet — hit Run Now to generate a report</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Feed */}
              <TabsContent value="feed">
                <div className="bg-[#0a0a0a] rounded-xl overflow-hidden h-[420px] border border-white/6">
                  {activeRunId
                    ? <AgentCopilot runId={activeRunId} running={isRunning} />
                    : <p className="text-white/30 text-sm text-center pt-16">No run selected</p>
                  }
                </div>
              </TabsContent>

              {/* History */}
              <TabsContent value="history">
                <div className="space-y-2">
                  {runs.length === 0 ? (
                    <p className="text-black/30 text-sm text-center py-10">No runs yet</p>
                  ) : runs.map(run => (
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
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-4">
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

            <div className="bg-white border border-black/8 rounded-xl p-5">
              <p className="section-label mb-3">Run History</p>
              <div className="flex flex-wrap gap-1.5">
                {runs.slice(0, 12).map(r => (
                  <button
                    key={r.id}
                    onClick={() => setActiveRunId(r.id)}
                    title={`${r.status} — ${formatRelative(r.triggered_at)}`}
                    className={`w-3 h-3 rounded-full transition-transform hover:scale-125 ${
                      r.status === 'complete' ? 'bg-green-400' :
                      r.status === 'failed'   ? 'bg-red-400' :
                      r.status === 'running'  ? 'bg-blue-400 animate-pulse' :
                      'bg-black/15'
                    }`}
                  />
                ))}
                {runs.length === 0 && <p className="text-xs text-black/30">No runs yet</p>}
              </div>
            </div>

            {workflow.definition.output?.channels?.length > 0 && (
              <div className="bg-white border border-black/8 rounded-xl p-5">
                <p className="section-label mb-3">Output</p>
                <div className="flex flex-wrap gap-1.5">
                  {workflow.definition.output.channels.map((ch, i) => (
                    <Badge key={i} variant="muted">{ch.type}</Badge>
                  ))}
                </div>
              </div>
            )}
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
