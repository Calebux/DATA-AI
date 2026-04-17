'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'

const FEATURED = [
  {
    num: '01', category: 'FINANCE',
    title: 'WEEKLY SAAS INTELLIGENCE',
    desc: 'Stripe + HubSpot → 3-agent churn consensus → CEO briefing by 8AM Monday.',
  },
  {
    num: '02', category: 'CUSTOMER SUCCESS',
    title: 'CHURN RISK MONITOR',
    desc: 'Daily CRM scan surfaces at-risk accounts before they cancel.',
  },
  {
    num: '03', category: 'OPERATIONS',
    title: 'INFRA ALERT MONITOR',
    desc: 'Webhook alerts → triage consensus → human escalation for P1/P2.',
  },
]

const EXECUTION_LOG = [
  { time: 'T+00:02', cls: 'text-black/50',  msg: '3 agents spawned in parallel → Stripe · HubSpot · Web Scrape' },
  { time: 'T+01:02', cls: 'text-green-700', msg: '✓ All data ingested — Phase 2 begins' },
  { time: 'T+01:04', cls: 'text-black/50',  msg: '3 analysts running → Revenue · Churn (×3 consensus) · Competitive' },
  { time: 'T+02:55', cls: 'text-green-700', msg: '✓ Consensus resolved — Agent 2 wins (confidence: 0.91)' },
  { time: 'T+03:41', cls: 'text-yellow-700', msg: '⚠ Eval failed — specificity too low. Retry with feedback...' },
  { time: 'T+04:10', cls: 'text-green-700', msg: '✓ Eval passed — 9.2/10. Email sent to CEO & COO' },
]

const CAPABILITIES = [
  { label: 'SWARM EXECUTION',   desc: 'Multiple agents run in parallel across phases. No single-agent bottlenecks.' },
  { label: 'CONSENSUS VOTING',  desc: 'Run 3 agents on the same task. Reconcile by highest confidence or majority.' },
  { label: 'SELF-CORRECTING',   desc: 'Eval agent scores every output. Failures trigger automatic retries with feedback.' },
  { label: 'HUMAN ESCALATION',  desc: 'Critical decisions can be paused and routed to a human before proceeding.' },
  { label: 'FULL AUDIT TRAIL',  desc: 'Every agent decision, vote, and retry is logged and replayable step by step.' },
  { label: 'ZERO BABYSITTING',  desc: 'Trigger on cron, webhook, or spreadsheet. Runs end-to-end without intervention.' },
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
            DATA-AI replaces that cycle with a coordinated swarm of AI agents.
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
            <p className="section-label mb-2">Swarm Size</p>
            <div className="text-4xl font-extrabold text-black">6</div>
            <p className="text-xs text-black/35 mt-1">agents per workflow</p>
          </div>
        </div>
      </div>

      {/* Execution log */}
      <div className="mb-16">
        <p className="section-label mb-4">Live Execution — Weekly SaaS Intelligence Report</p>
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
