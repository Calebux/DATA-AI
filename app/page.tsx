'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'

const FEATURED = [
  {
    num: '01', category: 'RESEARCH',
    title: 'DEEP MARKET RESEARCH',
    desc: 'Web researcher → critic loop (×2 rounds) → polished intelligence brief, fully sourced.',
  },
  {
    num: '02', category: 'OPERATIONS',
    title: 'INFRA ALERT MONITOR',
    desc: 'Webhook alerts → 3-agent triage consensus → human escalation for P1/P2.',
  },
  {
    num: '03', category: 'COMPETITIVE',
    title: 'COMPETITOR INTELLIGENCE',
    desc: 'Parallel web research on rivals → analyst synthesis → weekly briefing every Monday.',
  },
]

const EXECUTION_LOG = [
  { time: 'T+00:02', cls: 'text-black/50',   msg: 'Researcher spawned → generating 3 Exa search queries via Claude Haiku' },
  { time: 'T+00:18', cls: 'text-black/50',   msg: '8 sources fetched and deduplicated — synthesis beginning' },
  { time: 'T+01:04', cls: 'text-green-700',  msg: '✓ Research complete — passing to analyst' },
  { time: 'T+01:06', cls: 'text-black/50',   msg: 'Analyst draft → Critic review (round 1/2)' },
  { time: 'T+01:55', cls: 'text-yellow-700', msg: '⚠ Critic: specificity too low on competitive section. Revising...' },
  { time: 'T+02:40', cls: 'text-green-700',  msg: '✓ Critic approved round 2 (confidence: 0.94) — Eval: 9.2/10' },
]

const CAPABILITIES = [
  { label: 'SWARM EXECUTION',   desc: 'Multiple agents run in parallel across phases. No single-agent bottlenecks.' },
  { label: 'WEB RESEARCH',      desc: 'Researcher agents search the web via Exa, synthesize findings, and cite sources.' },
  { label: 'CRITIC LOOP',       desc: 'Analyst and critic agents iterate until output meets the quality bar you set.' },
  { label: 'CONSENSUS VOTING',  desc: 'Run 3 agents on the same task. Reconcile by highest confidence or majority.' },
  { label: 'SELF-CORRECTING',   desc: 'Eval agent scores every output. Failures trigger automatic retries with feedback.' },
  { label: 'HUMAN ESCALATION',  desc: 'Critical decisions pause and route to your Inbox before proceeding.' },
  { label: 'FULL AUDIT TRAIL',  desc: 'Every agent decision, vote, and retry is logged and replayable step by step.' },
  { label: 'ZERO BABYSITTING',  desc: 'Trigger on cron or webhook. Runs end-to-end without intervention.' },
]

export default function HomePage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [user, loading])

  if (loading || user) return null

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 pb-24">

      {/* Featured section */}
      <p className="section-label mb-5">Featured Workflows</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 border border-black/10 mb-16">
        {FEATURED.map((t, i) => (
          <Link
            key={t.num}
            href="/auth"
            className={`block p-6 hover:bg-black/3 transition-colors group ${i < 2 ? 'sm:border-r sm:border-black/10' : ''} ${i > 0 ? 'border-t sm:border-t-0 border-black/10' : ''}`}
          >
            <p className="section-label mb-8">{t.num} · {t.category}</p>
            <h3 className="text-[15px] font-bold tracking-tight text-black leading-snug mb-3 group-hover:text-black/80">
              {t.title}
            </h3>
            <p className="text-xs text-black/40 leading-relaxed">{t.desc}</p>
          </Link>
        ))}
      </div>

      {/* Manifesto + stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 mb-16 pb-12 rule">
        <div className="sm:col-span-2">
          <p className="section-label mb-4">Manifesto</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-black leading-tight mb-4">
            AUTOMATE AS CRAFT.
          </h2>
          <p className="text-sm text-black/45 leading-relaxed max-w-lg">
            Most business intelligence work is mechanical repetition — pulling the same data,
            running the same analysis, writing the same summaries.
            HoursBack replaces that cycle with a coordinated swarm of AI agents.
            You define the rules once. The system runs indefinitely.
          </p>
        </div>
        <div className="space-y-8">
          <div>
            <p className="section-label mb-2">vs. Manual</p>
            <div className="text-4xl font-extrabold text-black tabular-nums">38×</div>
            <p className="text-xs text-black/35 mt-1">faster execution</p>
          </div>
          <div>
            <p className="section-label mb-2">Agent Types</p>
            <div className="text-4xl font-extrabold text-black">8</div>
            <p className="text-xs text-black/35 mt-1">researcher · analyst · critic · eval · delivery + more</p>
          </div>
        </div>
      </div>

      {/* Execution log */}
      <div className="mb-16">
        <p className="section-label mb-4">Live Execution — Deep Market Research Workflow</p>
        <div className="border border-black/10 bg-[#f8f8f8] p-5 font-mono text-xs space-y-2">
          {EXECUTION_LOG.map(({ time, cls, msg }) => (
            <div key={time} className="flex gap-6">
              <span className="text-black/25 flex-shrink-0 tabular-nums">{time}</span>
              <span className={cls}>{msg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Capabilities index */}
      <div>
        <p className="section-label mb-0 pb-3 rule">Capabilities</p>
        {CAPABILITIES.map((c, i) => (
          <div key={c.label} className="flex items-baseline gap-4 py-3.5 rule">
            <span className="row-num">{String(i + 1).padStart(2, '0')}.</span>
            <span className="text-[13px] font-semibold text-black flex-shrink-0 w-44">{c.label}</span>
            <span className="text-black/25 text-xs">—</span>
            <span className="text-xs text-black/45 leading-relaxed">{c.desc}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-16 pt-8 rule-top flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <p className="section-label mb-1">Ready?</p>
          <p className="text-sm text-black/40">Deploy your first workflow in under 2 minutes.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="px-5 py-2 bg-black text-white text-[10px] tracking-[0.14em] uppercase font-semibold hover:bg-black/80 transition-colors"
          >
            Open Dashboard
          </Link>
          <Link
            href="/auth"
            className="px-5 py-2 border border-black/20 text-black text-[10px] tracking-[0.14em] uppercase hover:border-black/50 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>

    </div>
  )
}
