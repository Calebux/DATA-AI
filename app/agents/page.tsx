'use client'

import { AGENT_ICON_MAP, AGENT_COLOR, AGENT_LABEL, AGENT_DESC } from '@/lib/agent-icons'
import { Bot } from 'lucide-react'

const AGENT_CAPABILITIES: Record<string, string[]> = {
  orchestrator:  ['Builds task graph', 'Resolves dependencies', 'Spawns phase-parallel agents', 'Monitors execution state'],
  data_ingestor: ['REST / GraphQL APIs', 'Web scraping', 'Google Sheets sync', 'Webhook ingestion', 'File upload parsing'],
  analyst:       ['LLM-powered reasoning', 'Churn / risk scoring', 'Trend detection', 'Structured output', 'Confidence scoring'],
  eval:          ['Quality scoring 0-10', 'Multi-criteria rubrics', 'Auto-retry with feedback', 'Blocks delivery on fail'],
  delivery:      ['Email reports (HTML/plain)', 'Slack webhooks', 'Telegram push', 'PDF / Markdown export', 'External API POST'],
  watcher:       ['Threshold alerting', 'Metric tracking over time', 'Anomaly detection', 'Continuous monitoring'],
  escalator:     ['Pause pipeline mid-run', 'Human-in-the-loop routing', 'Resumes on approval', 'Halts on rejection'],
}

const AGENT_ORDER = [
  'orchestrator',
  'data_ingestor',
  'analyst',
  'eval',
  'delivery',
  'watcher',
  'escalator',
] as const

const COLOR_DOT: Record<string, string> = {
  'text-violet-500':  'bg-violet-500',
  'text-blue-500':    'bg-blue-500',
  'text-amber-500':   'bg-amber-500',
  'text-emerald-500': 'bg-emerald-500',
  'text-cyan-500':    'bg-cyan-500',
  'text-slate-400':   'bg-slate-400',
  'text-orange-500':  'bg-orange-500',
}

export default function AgentsPage() {
  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 pt-24 pb-20">

      {/* Header */}
      <div className="rule pb-6 mb-8">
        <p className="section-label mb-2">Infrastructure</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-black">Agent Roster</h1>
        <p className="text-sm text-black/45 mt-1 max-w-lg">
          Seven specialised roles. Each agent is stateless, scoped to a single step, and communicates
          exclusively through the orchestrator—enabling safe, auditable swarm execution.
        </p>
      </div>

      {/* Stat bar */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-px border border-black/8 mb-10 text-center">
        {[
          { v: '7',    l: 'Roles' },
          { v: '3+',   l: 'Consensus' },
          { v: '∞',    l: 'Parallel' },
          { v: '90s',  l: 'Escalation timeout' },
          { v: '3',    l: 'Max retries' },
          { v: '100%', l: 'Auditable' },
        ].map(({ v, l }) => (
          <div key={l} className="py-4 border-r border-black/8 last:border-r-0 col-span-1">
            <div className="text-xl font-bold text-black tabular-nums">{v}</div>
            <div className="section-label mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      {/* Agent list */}
      <div>
        {AGENT_ORDER.map((role, i) => {
          const Icon = AGENT_ICON_MAP[role] ?? Bot
          const colorClass = AGENT_COLOR[role] ?? 'text-slate-400'
          const dotClass = COLOR_DOT[colorClass] ?? 'bg-slate-400'
          const caps = AGENT_CAPABILITIES[role] ?? []

          return (
            <div key={role} className="rule py-6">
              <div className="flex gap-4 sm:gap-6">
                {/* Number + icon */}
                <div className="flex flex-col items-center gap-2 flex-shrink-0 pt-0.5">
                  <span className="row-num">{String(i + 1).padStart(2, '0')}</span>
                  <div className={`${colorClass} opacity-70`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-base font-semibold text-black tracking-tight">
                      {AGENT_LABEL[role] ?? role}
                    </h2>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass} opacity-60`} />
                    <code className="text-[10px] text-black/30 font-mono">{role}</code>
                  </div>
                  <p className="text-sm text-black/55 leading-relaxed mb-3 max-w-2xl">
                    {AGENT_DESC[role]}
                  </p>
                  {/* Capabilities */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {caps.map(cap => (
                      <span key={cap} className="text-[11px] text-black/40 before:content-['—'] before:mr-1 before:text-black/20">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Role tag */}
                <div className="hidden sm:flex flex-col items-end justify-start flex-shrink-0 pt-1">
                  <span className="section-label border border-black/10 px-2 py-1 text-black/40">
                    {role === 'orchestrator' ? 'COORDINATOR' :
                     role === 'data_ingestor' ? 'INGESTION' :
                     role === 'analyst' ? 'REASONING' :
                     role === 'eval' ? 'QUALITY' :
                     role === 'delivery' ? 'OUTPUT' :
                     role === 'watcher' ? 'MONITORING' :
                     'ESCALATION'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Communication protocol section */}
      <div className="mt-12 border border-black/8 p-6 sm:p-8">
        <p className="section-label mb-4">Communication Protocol</p>
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-black mb-2">Agent-to-Agent Messaging</h3>
            <p className="text-sm text-black/50 leading-relaxed">
              All inter-agent communication is mediated by the orchestrator. Agents never call each other
              directly — they emit typed events (<code className="text-[11px] bg-black/5 px-1">AgentEvent</code>) which the
              orchestrator routes based on the workflow graph.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-black mb-2">Consensus Protocol</h3>
            <p className="text-sm text-black/50 leading-relaxed">
              For high-stakes steps, the orchestrator spawns N analyst instances in parallel. Each submits
              a scored output. The orchestrator reconciles via majority vote, highest confidence, or union
              — configurable per step.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-black mb-2">Eval Loop</h3>
            <p className="text-sm text-black/50 leading-relaxed">
              Every analyst output passes through an eval agent before proceeding. On failure, the eval
              agent returns targeted feedback and the orchestrator re-queues the analyst step (up to
              <code className="text-[11px] bg-black/5 px-1 mx-0.5">max_retries</code> times).
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-black mb-2">Human Escalation</h3>
            <p className="text-sm text-black/50 leading-relaxed">
              The escalator agent pauses the pipeline and routes a structured decision request to a human
              operator. Execution resumes automatically on approval or halts cleanly on rejection — with
              full event audit trail.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
