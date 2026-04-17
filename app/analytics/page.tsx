'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { ArrowLeft, BarChart3, DollarSign, Cpu, Zap, Activity, User } from 'lucide-react'

interface WorkflowCost {
  workflow_id: string
  workflow_name: string
  tokens: number
  runs: number
}

// Fixed estimation $2.50 per 1M tokens (e.g., standard GPT-4o blend)
const COST_PER_1M_TOKENS = 2.50

export default function AnalyticsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  
  const [loading, setLoading] = useState(true)
  const [totalTokens, setTotalTokens] = useState(0)
  const [totalRuns, setTotalRuns] = useState(0)
  const [costBreakdown, setCostBreakdown] = useState<WorkflowCost[]>([])

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth')
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return

    async function load() {
      const supabase = getSupabase()

      // Fetch user workflows
      const { data: wfs } = await supabase.from('workflows').select('id, name').eq('user_id', user!.id)
      const wfNames = new Map((wfs || []).map(w => [w.id, w.name]))

      // Fetch all runs
      const { data: runs } = await supabase.from('workflow_runs').select('id, workflow_id').in('workflow_id', Array.from(wfNames.keys()))
      const runMap = new Map((runs || []).map(r => [r.id, r.workflow_id]))
      const runCountByWf: Record<string, number> = {}
      ;(runs || []).forEach(r => {
        runCountByWf[r.workflow_id] = (runCountByWf[r.workflow_id] || 0) + 1
      })

      // Fetch all agent memories to sum tokens
      const { data: mems } = await supabase.from('agent_memories').select('run_id, tokens_used').not('tokens_used', 'is', null)

      let totalT = 0
      const tokensByWf: Record<string, number> = {}

      ;(mems || []).forEach(m => {
        const wfId = runMap.get(m.run_id)
        if (wfId) {
          const toks = m.tokens_used || 0
          totalT += toks
          tokensByWf[wfId] = (tokensByWf[wfId] || 0) + toks
        }
      })

      const breakdown: WorkflowCost[] = Object.keys(tokensByWf).map(wfId => ({
        workflow_id: wfId,
        workflow_name: wfNames.get(wfId) || 'Unknown',
        tokens: tokensByWf[wfId],
        runs: runCountByWf[wfId] || 0
      })).sort((a, b) => b.tokens - a.tokens)

      setTotalTokens(totalT)
      setTotalRuns(runs?.length || 0)
      setCostBreakdown(breakdown)
      setLoading(false)
    }

    load()
  }, [user])

  if (authLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-apple-gray">
        <Spinner className="text-black/20" />
      </div>
    )
  }

  const computeCost = (tokens: number) => {
    const cost = (tokens / 1_000_000) * COST_PER_1M_TOKENS
    return cost < 0.01 ? '<$0.01' : `$\${cost.toFixed(2)}`
  }

  const maxTokens = Math.max(...costBreakdown.map(c => c.tokens), 1)

  return (
    <div className="min-h-screen bg-apple-gray flex flex-col">
      {/* Top Navbar */}
      <div className="h-14 glass-nav flex items-center justify-between px-6 sticky top-0 z-20 flex-shrink-0">
        <div className="flex items-center">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white transition-colors mr-6">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2 text-white">
            <BarChart3 className="h-4 w-4 opacity-70" />
            <h1 className="text-sm font-bold tracking-tight">Compute Analytics</h1>
          </div>
        </div>
        <Link href="/profile" className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
          <User className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full p-6 sm:p-8 space-y-8">
        
        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="apple-card p-6">
            <div className="flex items-center gap-2 text-black/40 mb-2 font-semibold text-[10px] tracking-widest uppercase">
              <DollarSign className="h-4 w-4" /> Total Estimated Cost
            </div>
            <div className="text-3xl font-bold tracking-tight text-black">
              {computeCost(totalTokens)}
            </div>
            <div className="text-xs text-black/30 mt-2">
              Based on $2.50 per 1M blended tokens.
            </div>
          </div>
          
          <div className="apple-card p-6">
            <div className="flex items-center gap-2 text-black/40 mb-2 font-semibold text-[10px] tracking-widest uppercase">
              <Cpu className="h-4 w-4" /> Aggregated Compute
            </div>
            <div className="text-3xl font-bold tracking-tight text-black">
              {(totalTokens / 1_000).toFixed(1)}k
            </div>
            <div className="text-xs text-black/30 mt-2">
              Total tokens consumed across all swarms.
            </div>
          </div>
          
          <div className="apple-card p-6">
            <div className="flex items-center gap-2 text-black/40 mb-2 font-semibold text-[10px] tracking-widest uppercase">
              <Activity className="h-4 w-4" /> Total Runs Executed
            </div>
            <div className="text-3xl font-bold tracking-tight text-black">
              {totalRuns}
            </div>
            <div className="text-xs text-black/30 mt-2">
              Orchestrator successful & failed lifecycle runs.
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="apple-card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-black/5 tracking-tight font-bold text-black flex items-center gap-2 bg-black/[0.02]">
            <Zap className="h-4 w-4 text-black/40" /> Workflow Compute Burn
          </div>
          
          {costBreakdown.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-black/40">No compute data logged yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {costBreakdown.map(wf => {
                const widthPct = Math.max(2, (wf.tokens / maxTokens) * 100)
                return (
                  <div key={wf.workflow_id} className="p-6 hover:bg-black/[0.01] transition-colors">
                    <div className="flex items-end justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-black text-sm">{wf.workflow_name}</h3>
                        <p className="text-[10px] uppercase font-bold tracking-wider text-black/30 mt-1">
                          {wf.runs} Total Runs
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-black text-sm">{computeCost(wf.tokens)}</p>
                        <p className="text-[10px] text-black/40 font-mono mt-1">{wf.tokens.toLocaleString()} tokens</p>
                      </div>
                    </div>
                    {/* Bar graphic */}
                    <div className="h-2 w-full bg-black/5 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `\${widthPct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
