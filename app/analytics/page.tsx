'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { DollarSign, Cpu, Activity, CheckCircle, Star, Zap } from 'lucide-react'

interface WorkflowCost {
  workflow_id: string
  workflow_name: string
  tokens: number
  runs: number
  success_rate: number
  avg_quality: number | null
}

const COST_PER_1M_TOKENS = 3.00 // Claude Sonnet 4.6 blended estimate

export default function AnalyticsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [totalTokens, setTotalTokens] = useState(0)
  const [totalRuns, setTotalRuns] = useState(0)
  const [successRate, setSuccessRate] = useState(0)
  const [avgQuality, setAvgQuality] = useState<number | null>(null)
  const [costBreakdown, setCostBreakdown] = useState<WorkflowCost[]>([])

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth')
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return
    async function load() {
      const supabase = getSupabase()

      const { data: wfs } = await supabase.from('workflows').select('id, name').eq('user_id', user!.id)
      if (!wfs?.length) { setLoading(false); return }
      const wfNames = new Map(wfs.map(w => [w.id, w.name]))
      const wfIds = Array.from(wfNames.keys())

      const { data: runs } = await supabase
        .from('workflow_runs')
        .select('id, workflow_id, status, quality_score')
        .in('workflow_id', wfIds)

      const runMap = new Map((runs ?? []).map(r => [r.id, r.workflow_id]))
      const runCountByWf: Record<string, number> = {}
      const successByWf: Record<string, number> = {}
      const qualityByWf: Record<string, number[]> = {}
      let totalComplete = 0

      for (const r of (runs ?? [])) {
        runCountByWf[r.workflow_id] = (runCountByWf[r.workflow_id] ?? 0) + 1
        if (r.status === 'complete') {
          totalComplete++
          successByWf[r.workflow_id] = (successByWf[r.workflow_id] ?? 0) + 1
        }
        if (r.quality_score != null) {
          if (!qualityByWf[r.workflow_id]) qualityByWf[r.workflow_id] = []
          qualityByWf[r.workflow_id].push(r.quality_score)
        }
      }

      const totalRunCount = runs?.length ?? 0
      const globalSuccessRate = totalRunCount > 0 ? (totalComplete / totalRunCount) * 100 : 0

      const allQualityScores = Object.values(qualityByWf).flat()
      const globalAvgQuality = allQualityScores.length > 0
        ? allQualityScores.reduce((a, b) => a + b, 0) / allQualityScores.length
        : null

      // Token usage from agent_memory
      const { data: mems } = await supabase
        .from('agent_memory')
        .select('run_id, tokens_used')
        .not('tokens_used', 'is', null)

      let totalT = 0
      const tokensByWf: Record<string, number> = {}
      for (const m of (mems ?? [])) {
        const wfId = runMap.get(m.run_id)
        if (wfId) {
          totalT += m.tokens_used ?? 0
          tokensByWf[wfId] = (tokensByWf[wfId] ?? 0) + (m.tokens_used ?? 0)
        }
      }

      const breakdown: WorkflowCost[] = wfIds
        .filter(id => runCountByWf[id])
        .map(id => ({
          workflow_id: id,
          workflow_name: wfNames.get(id) ?? 'Unknown',
          tokens: tokensByWf[id] ?? 0,
          runs: runCountByWf[id] ?? 0,
          success_rate: runCountByWf[id] > 0 ? ((successByWf[id] ?? 0) / runCountByWf[id]) * 100 : 0,
          avg_quality: qualityByWf[id]?.length
            ? qualityByWf[id].reduce((a, b) => a + b, 0) / qualityByWf[id].length
            : null,
        }))
        .sort((a, b) => b.runs - a.runs)

      setTotalTokens(totalT)
      setTotalRuns(totalRunCount)
      setSuccessRate(globalSuccessRate)
      setAvgQuality(globalAvgQuality)
      setCostBreakdown(breakdown)
      setLoading(false)
    }
    load()
  }, [user])

  if (authLoading || loading) {
    return <div className="flex justify-center py-20"><Spinner className="text-black/20" /></div>
  }

  const computeCost = (tokens: number) => {
    const cost = (tokens / 1_000_000) * COST_PER_1M_TOKENS
    return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`
  }

  const maxRuns = Math.max(...costBreakdown.map(c => c.runs), 1)

  const kpis = [
    { icon: Activity,     label: 'Total Runs',      value: String(totalRuns) },
    { icon: CheckCircle,  label: 'Success Rate',     value: `${successRate.toFixed(0)}%` },
    { icon: Star,         label: 'Avg Quality',      value: avgQuality != null ? `${(avgQuality * 10).toFixed(1)}/10` : '—' },
    { icon: Cpu,          label: 'Tokens Used',      value: totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : String(totalTokens) },
    { icon: DollarSign,   label: 'Est. Cost',        value: computeCost(totalTokens) },
  ]

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 space-y-8">

      <div>
        <h1 className="text-xl font-bold tracking-tight text-black">Analytics</h1>
        <p className="text-sm text-black/40 mt-0.5">Aggregate stats across all your workflows.</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map(({ icon: Icon, label, value }) => (
          <div key={label} className="apple-card p-5">
            <div className="flex items-center gap-1.5 text-black/35 mb-2">
              <Icon className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-widest">{label}</span>
            </div>
            <div className="text-2xl font-bold tracking-tight text-black">{value}</div>
          </div>
        ))}
      </div>

      {/* Per-workflow breakdown */}
      <div className="apple-card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-black/5 font-bold text-black flex items-center gap-2 bg-black/[0.01]">
          <Zap className="h-4 w-4 text-black/40" /> Workflow Breakdown
        </div>

        {costBreakdown.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-black/40">No run data yet. Run a workflow to see analytics.</p>
          </div>
        ) : (
          <div className="divide-y divide-black/5">
            {costBreakdown.map(wf => (
              <div key={wf.workflow_id} className="px-6 py-5 hover:bg-black/[0.01] transition-colors">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="font-semibold text-black text-sm">{wf.workflow_name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-black/35">{wf.runs} runs</span>
                      <span className="text-[10px] text-black/35">{wf.success_rate.toFixed(0)}% success</span>
                      {wf.avg_quality != null && (
                        <span className="text-[10px] text-black/35">{(wf.avg_quality * 10).toFixed(1)}/10 quality</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-black text-sm">{computeCost(wf.tokens)}</p>
                    <p className="text-[10px] text-black/35 font-mono mt-0.5">{wf.tokens.toLocaleString()} tokens</p>
                  </div>
                </div>
                {/* Runs bar */}
                <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-black/25 rounded-full transition-all"
                    style={{ width: `${Math.max(2, (wf.runs / maxRuns) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
