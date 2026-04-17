'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import OrchestratorModal from '@/components/orchestrator-modal/OrchestratorModal'
import { Spinner } from '@/components/ui/spinner'
import type { Workflow, WorkflowRun } from '@/types'
import { formatRelative } from '@/lib/utils'

const CATEGORY_LABELS: Record<string, string> = {
  finance_executive: 'FINANCE',
  customer_success:  'CUST. SUCCESS',
  sales:             'SALES',
  marketing:         'MARKETING',
  product:           'PRODUCT',
  operations:        'OPERATIONS',
  hr:                'HR',
  custom:            'CUSTOM',
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [lastRuns, setLastRuns] = useState<Record<string, WorkflowRun>>({})
  const [loading, setLoading] = useState(true)
  const [runTarget, setRunTarget] = useState<Workflow | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth')
  }, [user, authLoading])

  useEffect(() => {
    if (!user) return
    const supabase = getSupabase()
    async function load() {
      const { data: wfs } = await supabase
        .from('workflows').select('*')
        .eq('user_id', user!.id).order('created_at', { ascending: false })

      if (!wfs?.length) { setLoading(false); return }
      setWorkflows(wfs as Workflow[])

      const { data: runs } = await supabase
        .from('workflow_runs').select('*')
        .in('workflow_id', wfs.map(w => w.id))
        .order('triggered_at', { ascending: false })

      const map: Record<string, WorkflowRun> = {}
      for (const r of (runs ?? []) as WorkflowRun[]) {
        if (!map[r.workflow_id]) map[r.workflow_id] = r
      }
      setLastRuns(map)
      setLoading(false)
    }
    load()
  }, [user])

  if (authLoading || loading) {
    return <div className="flex justify-center pt-28"><Spinner size="sm" className="text-black/20" /></div>
  }

  const running = workflows.filter(w => lastRuns[w.id]?.status === 'running')
  const rest    = workflows.filter(w => lastRuns[w.id]?.status !== 'running')
  const ordered = [...running, ...rest]

  const totalRuns    = Object.values(lastRuns).length
  const failureCount = Object.values(lastRuns).filter(r => r.status === 'failed').length

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 pb-24">

      {/* Header */}
      <div className="flex items-end justify-between mb-8 pb-4 rule">
        <div>
          <p className="section-label mb-1.5">Workspace</p>
          <h1 className="text-xl font-bold tracking-tight text-black">Workflows</h1>
        </div>
        <Link
          href="/workflows/new"
          className="px-4 py-1.5 border border-black/15 text-[10px] tracking-[0.12em] uppercase text-black/45 hover:text-black hover:border-black/40 transition-colors"
        >
          + New
        </Link>
      </div>

      {workflows.length === 0 ? (
        <div className="py-24 text-center">
          <p className="section-label mb-4">No workflows yet</p>
          <p className="text-sm text-black/35 mb-8 max-w-sm mx-auto leading-relaxed">
            Create your first workflow to start automating complex tasks with AI agent swarms.
          </p>
          <Link
            href="/workflows/new"
            className="inline-block px-6 py-2 border border-black/20 text-[10px] tracking-[0.12em] uppercase text-black/55 hover:text-black hover:border-black/45 transition-colors"
          >
            Create Workflow
          </Link>
        </div>
      ) : (
        <>
          {/* Workflow list */}
          <div className="mb-12">
            <p className="section-label mb-0 pb-2.5 rule">
              {running.length > 0 ? `Active & Scheduled — ${running.length} Live` : 'All Workflows'}
            </p>

            {ordered.map((wf, i) => {
              const run    = lastRuns[wf.id]
              const isLive = run?.status === 'running'
              const num    = String(i + 1).padStart(2, '0')

              return (
                <div
                  key={wf.id}
                  className={`flex items-center gap-4 px-0 py-3.5 rule cursor-pointer group transition-colors ${isLive ? 'row-inverted' : 'hover:bg-black/3'}`}
                  onClick={() => router.push(isLive ? `/workflows/${wf.id}?run=${run.id}` : `/workflows/${wf.id}`)}
                >
                  <span className={`row-num ${isLive ? 'row-num' : ''}`}>{num}.</span>

                  <div className="flex-1 min-w-0 flex items-baseline gap-2">
                    <span className={`text-[13px] font-semibold tracking-tight flex-shrink-0 ${isLive ? 'text-white' : 'text-black'}`}>
                      {wf.name}
                    </span>
                    {wf.description && (
                      <>
                        <span className={`text-xs flex-shrink-0 ${isLive ? 'text-white/30' : 'text-black/20'}`}>—</span>
                        <span className={`text-xs truncate ${isLive ? 'text-white/55' : 'text-black/40'}`}>
                          {wf.description}
                        </span>
                      </>
                    )}
                  </div>

                  {run && (
                    <span className={`hidden sm:block text-[10px] flex-shrink-0 ${isLive ? 'text-white/40' : 'text-black/25'}`}>
                      {isLive ? 'running now' : formatRelative(run.triggered_at)}
                    </span>
                  )}

                  <span className={`text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 border flex-shrink-0 ${isLive ? 'border-white/20 text-white/60' : 'border-black/15 text-black/40'}`}>
                    {isLive ? 'LIVE' : (CATEGORY_LABELS[wf.category] ?? wf.category.toUpperCase())}
                  </span>

                  {!isLive && (
                    <button
                      onClick={e => { e.stopPropagation(); setRunTarget(wf) }}
                      className="hidden sm:block text-[9px] tracking-widest uppercase text-black/25 hover:text-black/60 transition-colors px-2 py-0.5 border border-transparent hover:border-black/15 flex-shrink-0"
                    >
                      Run
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* System stats */}
          <div>
            <p className="section-label mb-0 pb-2.5 rule">System Stats</p>
            {[
              { label: 'Total Workflows',   desc: 'Configured automations',  value: workflows.length },
              { label: 'Runs Recorded',     desc: 'Executions tracked',       value: totalRuns },
              { label: 'Active Now',        desc: 'Currently executing',      value: running.length },
              { label: 'Failed Last Cycle', desc: 'Runs ending in error',     value: failureCount },
            ].map(({ label, desc, value }) => (
              <div key={label} className="flex items-center gap-4 py-3.5 rule">
                <span className="row-num text-[9px] tracking-widest text-black/25">STAT</span>
                <span className="text-[13px] font-semibold text-black flex-shrink-0">{label}</span>
                <span className="text-xs text-black/20 mx-1">—</span>
                <span className="text-xs text-black/40 flex-1">{desc}</span>
                <span className="text-sm font-bold text-black tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {runTarget && (
        <OrchestratorModal
          open
          workflow={runTarget}
          onClose={() => setRunTarget(null)}
          onRunStarted={runId => router.push(`/workflows/${runTarget.id}?run=${runId}`)}
        />
      )}
    </div>
  )
}
