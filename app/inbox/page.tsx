'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { formatRelative } from '@/lib/utils'
import type { AgentEvent } from '@/types'
import {
  ArrowLeft, Bell, AlertTriangle, CheckCircle, XCircle, Clock, User
} from 'lucide-react'

interface Escalation {
  id: string
  run_id: string
  step_id: string
  workflow_name: string
  severity: string
  summary: string
  created_at: string
  expires_at: number
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  payload: any
}

export default function InboxPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  
  // Force re-renders for countdowns
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth')
  }, [user, authLoading, router])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!user) return
    let active = true

    async function load() {
      const supabase = getSupabase()

      // Fetch user workflows for names
      const { data: wfs } = await supabase.from('workflows').select('id, name').eq('user_id', user!.id)
      const wfNames = new Map((wfs || []).map(w => [w.id, w.name]))

      // Fetch runs to map run_id -> workflow_id
      const { data: runs } = await supabase.from('workflow_runs').select('id, workflow_id')
      const runMap = new Map((runs || []).map(r => [r.id, r.workflow_id]))

      // Fetch all escalation events (requested, approved, rejected)
      const { data: events } = await supabase
        .from('agent_events')
        .select('*')
        .in('event_type', ['ESCALATION_REQUESTED', 'HUMAN_APPROVED', 'HUMAN_REJECTED'])
        .order('created_at', { ascending: false })
        .limit(200)

      if (!active || !events) return

      const evs = events as AgentEvent[]
      
      // Group by run_id + step_id
      const grouped = new Map<string, AgentEvent[]>()
      evs.forEach(e => {
        const key = `${e.run_id}-${e.step_id}`
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(e)
      })

      const loaded: Escalation[] = []

      grouped.forEach((groupEvents, key) => {
        const request = groupEvents.find(e => e.event_type === 'ESCALATION_REQUESTED')
        if (!request) return
        
        const approved = groupEvents.find(e => e.event_type === 'HUMAN_APPROVED')
        const rejected = groupEvents.find(e => e.event_type === 'HUMAN_REJECTED')
        
        const createdAt = new Date(request.created_at).getTime()
        const expiresAt = createdAt + 90_000 // 90 seconds timeout
        
        let status: Escalation['status'] = 'pending'
        if (approved) status = 'approved'
        else if (rejected) status = 'rejected'
        else if (Date.now() > expiresAt) status = 'expired'

        const wfId = runMap.get(request.run_id)
        const wfName = wfId ? (wfNames.get(wfId) || 'Unknown Workflow') : 'Unknown Workflow'
        
        const payload = (request.payload || {}) as any
        
        loaded.push({
          id: key,
          run_id: request.run_id,
          step_id: request.step_id!,
          workflow_name: wfName,
          severity: payload.severity || 'UNKNOWN',
          summary: payload.summary || 'Escalation requested for review.',
          created_at: request.created_at,
          expires_at: expiresAt,
          status,
          payload
        })
      })

      // Sort pending first, then by newest
      loaded.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1
        if (a.status !== 'pending' && b.status === 'pending') return 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })

      setEscalations(loaded)
      setLoading(false)
    }

    load()
    const interval = setInterval(load, 3000)
    return () => { active = false; clearInterval(interval) }
  }, [user])

  async function handleResolve(escalation: Escalation, decision: 'HUMAN_APPROVED' | 'HUMAN_REJECTED') {
    setProcessing(escalation.id)
    const supabase = getSupabase()
    
    await supabase.from('agent_events').insert({
      run_id: escalation.run_id,
      event_type: decision,
      source_agent: 'human',
      step_id: escalation.step_id,
      payload: { notes: `Human ${decision === 'HUMAN_APPROVED' ? 'approved' : 'rejected'} via Inbox UI` },
    })

    // Optimistic update
    setEscalations(prev => prev.map(e => {
      if (e.id === escalation.id) {
        return { ...e, status: decision === 'HUMAN_APPROVED' ? 'approved' : 'rejected' }
      }
      return e
    }))
    
    setProcessing(null)
  }

  if (authLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-apple-gray text-white">
        <Spinner className="text-white/20" />
      </div>
    )
  }

  const pending = escalations.filter(e => e.status === 'pending')
  const resolved = escalations.filter(e => e.status !== 'pending')

  return (
    <div className="min-h-screen bg-apple-gray flex flex-col">
      {/* Top Navbar */}
      <div className="h-14 glass-nav flex items-center justify-between px-6 sticky top-0 z-20 flex-shrink-0">
        <div className="flex items-center">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white transition-colors mr-6">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2 text-white">
            <Bell className="h-4 w-4 opacity-70" />
            <h1 className="text-sm font-bold tracking-tight">Action Inbox</h1>
          </div>
        </div>
        <Link href="/profile" className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
          <User className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full p-6 space-y-8">
        
        {/* Pending Escaalations */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-black flex items-center gap-2 mb-4">
            Action Required
            {pending.length > 0 && (
              <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px]">{pending.length}</span>
            )}
          </h2>

          {pending.length === 0 ? (
            <div className="apple-card p-10 text-center flex flex-col items-center">
              <div className="h-12 w-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-sm text-black font-semibold">Inbox Zero</p>
              <p className="text-xs text-black/40 mt-1">No pending agent escalations.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pending.map(e => {
                const msLeft = e.expires_at - now
                const pct = Math.max(0, Math.min(100, (msLeft / 90000) * 100))
                const secondsLeft = Math.ceil(Math.max(0, msLeft) / 1000)

                return (
                  <div key={e.id} className="apple-card overflow-hidden">
                    {/* Timer bar */}
                    <div className="h-1 bg-red-500/10 w-full overflow-hidden">
                      <div className="h-full bg-red-500 transition-all duration-1000 ease-linear" style={{ width: `\${pct}%` }} />
                    </div>

                    <div className="p-5 flex items-start gap-4">
                      <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-[10px] font-mono font-bold bg-black/5 px-1.5 py-0.5 rounded text-black/60">
                            {e.run_id.split('-')[0]}
                          </code>
                          <span className="text-xs text-black/40">&bull;</span>
                          <span className="text-xs font-semibold text-black/60">{e.workflow_name}</span>
                          <Badge variant="outline" className={`text-[9px] tracking-wider uppercase ml-2 ${
                            e.severity.includes('P1') ? 'bg-red-500/10 text-red-700 border-red-500/20' : 
                            'bg-orange-500/10 text-orange-700 border-orange-500/20'
                          }`}>
                            {e.severity}
                          </Badge>
                        </div>
                        
                        <h3 className="text-sm font-bold text-black mt-2 mb-2 leading-relaxed">
                          {e.summary}
                        </h3>
                        
                        {e.payload.root_cause && (
                          <div className="bg-black/[0.02] border border-black/5 rounded p-3 text-xs text-black/60 font-mono mt-3 mb-4">
                            <span className="font-bold text-black uppercase text-[10px] tracking-wider mb-1 block">Root Cause Hypothesis:</span>
                            {e.payload.root_cause}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-3 flex-shrink-0">
                        <div className="text-[10px] font-mono text-red-500 font-bold flex items-center gap-1 bg-red-500/5 px-2 py-1 rounded">
                          <Clock className="h-3 w-3" />
                          {secondsLeft}s left
                        </div>
                        <div className="flex gap-2">
                          <button 
                            disabled={processing === e.id}
                            onClick={() => handleResolve(e, 'HUMAN_REJECTED')}
                            className="px-4 py-2 border border-black/10 text-black text-xs font-medium rounded-lg hover:bg-black/5 transition-all disabled:opacity-50"
                          >
                            Reject
                          </button>
                          <button 
                            disabled={processing === e.id}
                            onClick={() => handleResolve(e, 'HUMAN_APPROVED')}
                            className="apple-btn-primary"
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* History */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-black/40 mb-4 px-1">Recent History</h2>
          <div className="space-y-3">
            {resolved.slice(0, 10).map(e => (
              <div key={e.id} className="apple-card p-4 flex items-center gap-4 opacity-75 mb-3">
                <div className="flex-shrink-0">
                  {e.status === 'approved' ? <CheckCircle className="h-4 w-4 text-green-600" /> :
                   e.status === 'rejected' ? <XCircle className="h-4 w-4 text-red-500" /> :
                   <Clock className="h-4 w-4 text-black/30" />}
                </div>
                
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded ${
                    e.status === 'approved' ? 'bg-green-500/10 text-green-700' :
                    e.status === 'rejected' ? 'bg-red-500/10 text-red-700' : 'bg-black/5 text-black/50'
                  }`}>
                    {e.status}
                  </span>
                  <span className="text-xs text-black/60 truncate max-w-sm">{e.summary}</span>
                </div>
                
                <span className="text-[10px] text-black/30">{formatRelative(e.created_at)}</span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
