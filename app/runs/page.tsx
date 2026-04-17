'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { formatRelative } from '@/lib/utils'
import type { Workflow, WorkflowRun } from '@/types'
import {
  Play, Activity, Bot
} from 'lucide-react'
import RunInspectorDrawer from '@/components/run-inspector/RunInspectorDrawer'

type PopulatedRun = WorkflowRun & {
  workflow?: Workflow
}

export default function RunsDashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  
  const [runs, setRuns] = useState<PopulatedRun[]>([])
  const [loading, setLoading] = useState(true)
  
  // Drawer state
  const [selectedRun, setSelectedRun] = useState<PopulatedRun | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth')
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return
    let active = true

    async function load() {
      const supabase = getSupabase()

      // Fetch all user's workflows
      const { data: wfs } = await supabase
        .from('workflows')
        .select('*')
        .eq('user_id', user!.id)

      if (!wfs?.length && active) {
        setRuns([])
        setLoading(false)
        return
      }

      // Fetch their runs
      const { data: runData } = await supabase
        .from('workflow_runs')
        .select('*')
        .in('workflow_id', wfs!.map(w => w.id))
        .order('triggered_at', { ascending: false })
        .limit(100) // Keep it sane for kanban

      if (active) {
        const wfMap = new Map(wfs!.map(w => [w.id, w]))
        const merged = (runData || []).map(r => ({
          ...r,
          workflow: wfMap.get(r.workflow_id)
        }))
        setRuns(merged as PopulatedRun[])
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 5000)
    return () => { active = false; clearInterval(interval) }
  }, [user])

  const runningRuns = runs.filter(r => r.status === 'running')
  const completedRuns = runs.filter(r => r.status === 'complete')
  const failedRuns = runs.filter(r => r.status === 'failed')

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="text-black/20" />
      </div>
    )
  }

  function renderRunCard(run: PopulatedRun) {
    const wf = run.workflow
    const stepsCount = wf?.definition?.steps?.length || 0
    
    return (
      <div
        key={run.id}
        onClick={() => setSelectedRun(run)}
        className={`apple-card p-5 cursor-pointer group ${
          selectedRun?.id === run.id ? 'ring-2 ring-[#0071e3] ring-offset-2 ring-offset-[#f5f5f7]' : 'hover:-translate-y-1'
        }`}
      >
        <div className="flex items-start justify-between mb-2">
          <code className="text-xs font-mono font-bold text-black/60 bg-black/5 px-1.5 py-0.5 rounded border border-black/10 transition-colors group-hover:text-black">
            {run.id.split('-')[0]}
          </code>
          {run.status === 'running' && (
            <span className="flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
          )}
        </div>
        
        <h3 className="font-bold text-black text-sm mb-1 truncate">{wf?.name || 'Unknown Workflow'}</h3>
        <p className="text-[10px] text-black/40 font-mono mb-4 truncate">{wf?.definition?.name}</p>
        
        <div className="pt-3 border-t border-black/5 flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold">
          <span className="text-black/40 flex items-center gap-1.5 bg-black/[0.03] px-2 py-1 rounded">
            <Bot className="h-3 w-3" />
            {stepsCount} Agents
          </span>
          <span className={
            run.status === 'complete' ? 'text-green-600' :
            run.status === 'failed' ? 'text-red-600' : 'text-blue-600'
          }>
            {run.status === 'running' ? 'Active' : run.status}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
        <div className="min-w-fit flex h-full p-6 items-start gap-6">
          
          {/* Running Column */}
          <div className="w-80 flex flex-col flex-shrink-0 max-h-full">
            <div className="flex items-center justify-between mb-4 px-1">
              <h2 className="text-xs font-bold uppercase tracking-widest text-black flex items-center gap-2">
                Running
                <span className="bg-black/10 text-black px-2 py-0.5 rounded-full text-[10px]">{runningRuns.length}</span>
              </h2>
            </div>
            {runningRuns.length === 0 ? (
              <div className="border border-dashed border-black/10 rounded-xl p-6 text-center bg-white/50">
                <p className="text-xs text-black/40">No active runs</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 overflow-y-auto pb-10 scrollbar-hide">
                {runningRuns.map(renderRunCard)}
              </div>
            )}
          </div>

          {/* Completed Column */}
          <div className="w-80 flex flex-col flex-shrink-0 max-h-full">
            <div className="flex items-center justify-between mb-4 px-1">
              <h2 className="text-xs font-bold uppercase tracking-widest text-black/60 flex items-center gap-2">
                Completed
                <span className="bg-black/5 text-black/50 px-2 py-0.5 rounded-full text-[10px]">{completedRuns.length}</span>
              </h2>
            </div>
            {completedRuns.length === 0 ? (
              <div className="border border-dashed border-black/10 rounded-xl p-6 text-center bg-white/50">
                <p className="text-xs text-black/40">No completed runs</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 overflow-y-auto pb-10 scrollbar-hide">
                {completedRuns.map(renderRunCard)}
              </div>
            )}
          </div>

          {/* Failed Column */}
          <div className="w-80 flex flex-col flex-shrink-0 max-h-full">
            <div className="flex items-center justify-between mb-4 px-1">
              <h2 className="text-xs font-bold uppercase tracking-widest text-black/60 flex items-center gap-2">
                Failed
                <span className="bg-black/5 text-black/50 px-2 py-0.5 rounded-full text-[10px]">{failedRuns.length}</span>
              </h2>
            </div>
            {failedRuns.length === 0 ? (
              <div className="border border-dashed border-black/10 rounded-xl p-6 text-center bg-white/50">
                <p className="text-xs text-black/40">No failed runs</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 overflow-y-auto pb-10 scrollbar-hide">
                {failedRuns.map(renderRunCard)}
              </div>
            )}
          </div>
          
        </div>
      </div>

      {/* Detail Drawer */}
      <RunInspectorDrawer 
        open={!!selectedRun} 
        run={selectedRun} 
        workflow={selectedRun?.workflow || null} 
        onClose={() => setSelectedRun(null)} 
      />
    </div>
  )
}
