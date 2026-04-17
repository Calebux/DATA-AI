'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import OrchestratorModal from '@/components/orchestrator-modal/OrchestratorModal'
import { Spinner } from '@/components/ui/spinner'
import { WORKFLOW_TEMPLATES } from '@/data/workflows'
import type { Workflow, WorkflowRun } from '@/types'
import { formatRelative } from '@/lib/utils'
import {
  TrendingUp, DollarSign, AlertCircle, Search, Target,
  Server, Wand2, Play, Activity, Bell, BarChart3, BookOpen, User, type LucideProps,
} from 'lucide-react'
import type { FC } from 'react'

const TEMPLATE_ICON_MAP: Record<string, FC<LucideProps>> = {
  TrendingUp, DollarSign, AlertCircle, Search, Target, Server, Wand2,
}
function WorkflowIcon({ icon, className }: { icon?: string; className?: string }) {
  const Icon = TEMPLATE_ICON_MAP[icon ?? ''] ?? Wand2
  return <Icon className={className} />
}

const CATEGORY_LABELS: Record<string, string> = {
  finance_executive: 'Finance', customer_success: 'Customer Success',
  sales: 'Sales', marketing: 'Marketing', product: 'Product',
  operations: 'Operations', hr: 'HR', custom: 'Custom',
}

const STATUS_DOT: Record<string, string> = {
  running: 'bg-green-500 animate-pulse',
  active:  'bg-black/30',
  paused:  'bg-black/15',
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [lastRuns,  setLastRuns]  = useState<Record<string, WorkflowRun>>({})
  const [loading,   setLoading]   = useState(true)
  const [runTarget,    setRunTarget]    = useState<Workflow | null>(null)

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

  return (
    <div className="min-h-screen bg-apple-gray flex flex-col">
      {/* Top Navbar */}
      <div className="h-14 glass-nav flex items-center justify-between px-6 sticky top-0 z-20 flex-shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-white">
            <Bot className="h-4 w-4 opacity-70" />
            <h1 className="text-sm font-bold tracking-tight">Workflows</h1>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/runs" className="px-3 py-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Runs
            </Link>
            <Link href="/inbox" className="px-3 py-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" /> Inbox
            </Link>
            <Link href="/knowledge" className="px-3 py-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> Knowledge Base
            </Link>
            <Link href="/analytics" className="px-3 py-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/workflows/new')}
            className="apple-btn-primary flex items-center gap-1.5 font-medium tracking-tight text-xs"
          >
            + New Workflow
          </button>
          <button 
            onClick={() => router.push('/profile')} 
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            title="Profile & Settings"
          >
            <User className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 pb-24 w-full flex-1">

      {workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-4">
          <div className="w-16 h-16 bg-black/[0.02] border border-black/10 rounded-2xl flex items-center justify-center mb-6">
            <Bot className="h-8 w-8 text-black/40" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-black mb-2">No workflows yet</h2>
          <p className="text-black/50 text-sm max-w-md mx-auto mb-10 leading-relaxed">
            Create your first workflow or start from one of our popular AI-native templates below.
          </p>

          {/* Quick-start templates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl text-left w-full mb-10">
            {WORKFLOW_TEMPLATES.slice(0, 3).map(t => (
              <div key={t.id} onClick={() => router.push('/workflows/new')}
                className="apple-card p-5 cursor-pointer flex flex-col group h-full hover:-translate-y-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-black/[0.02] text-black group-hover:bg-[#0071e3] group-hover:text-white transition-colors">
                    <WorkflowIcon icon={t.icon} className="h-5 w-5" />
                  </div>
                </div>
                <h3 className="font-bold text-black text-base">{t.name}</h3>
                <p className="text-xs text-black/50 mt-1.5 leading-relaxed line-clamp-3 mb-4 flex-1">
                  {t.description}
                </p>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-black/40 border-t border-black/5 pt-4">
                  <span className="font-semibold text-black/60">{CATEGORY_LABELS[t.category] ?? t.category}</span>
                  <span>·</span>
                  <span>Template</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => router.push('/workflows/new')}
            className="apple-btn-primary mt-4 tracking-tight"
          >
            Create Custom Workflow
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map(wf => {
            const run    = lastRuns[wf.id]
            const isLive = run?.status === 'running'
            const dotCls = isLive ? STATUS_DOT.running : STATUS_DOT.active

            return (
              <div
                key={wf.id}
                className="apple-card p-5 flex flex-col gap-4 hover:-translate-y-1 cursor-pointer group"
                onClick={() => router.push(isLive ? `/workflows/${wf.id}?run=${run.id}` : `/workflows/${wf.id}`)}
              >
                {/* Top row: icon + name + status dot */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-black/[0.02]">
                    <WorkflowIcon
                      icon={wf.definition?.name ? undefined : undefined}
                      className="h-4 w-4 text-black/40"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-black leading-tight truncate group-hover:text-black/80">
                      {wf.name}
                    </h3>
                    <p className="text-[10px] text-black/35 mt-0.5">
                      {CATEGORY_LABELS[wf.category] ?? wf.category}
                    </p>
                  </div>
                  <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${dotCls}`} />
                </div>

                {/* Description */}
                {wf.description && (
                  <p className="text-xs text-black/45 leading-relaxed line-clamp-2 -mt-1">
                    {wf.description}
                  </p>
                )}

                {/* Meta row */}
                <div className="flex items-center gap-3 text-[10px] text-black/30">
                  <span>{wf.definition.steps.length} agents</span>
                  <span>·</span>
                  <span className="capitalize">{wf.definition.trigger.type.replace('_', ' ')}</span>
                  {run && (
                    <>
                      <span>·</span>
                      <span>{isLive ? <span className="text-green-600 font-medium">Running now</span> : formatRelative(run.triggered_at)}</span>
                    </>
                  )}
                </div>

                {/* Last run quality */}
                {run?.quality_score != null && (
                  <div className="h-1 bg-black/6 rounded-full overflow-hidden -mt-1">
                    <div
                      className="h-full bg-black/40 rounded-full"
                      style={{ width: `${run.quality_score * 100}%` }}
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-black/6 -mx-5 px-5 mt-auto">
                  <Link
                    href={`/workflows/${wf.id}`}
                    onClick={e => e.stopPropagation()}
                    className="apple-link text-sm"
                  >
                    View
                  </Link>
                  <div className="flex-1" />
                  <button
                    onClick={e => { e.stopPropagation(); setRunTarget(wf) }}
                    className="apple-btn-primary py-1.5 px-3 flex items-center gap-1.5 text-xs"
                  >
                    <Play className="h-3 w-3" /> Run
                  </button>
                </div>
              </div>
            )
          })}

          {/* Add new card */}
          <button
            onClick={() => router.push('/workflows/new')}
            className="apple-card flex flex-col items-center justify-center gap-2 min-h-[180px] group bg-white/50 hover:bg-white"
          >
            <span className="text-2xl font-thin text-black/20 group-hover:text-[#0071e3] transition-colors">+</span>
            <span className="text-sm font-medium tracking-tight text-black/40 group-hover:text-[#0071e3] transition-colors">
              New Workflow
            </span>
          </button>
        </div>
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
    </div>
  )
}
