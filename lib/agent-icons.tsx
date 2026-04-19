import {
  Brain,
  Inbox,
  BarChart,
  ShieldCheck,
  Send,
  Eye,
  AlertTriangle,
  Bot,
  Search,
  MessageSquareWarning,
  Layers,
  type LucideProps,
} from 'lucide-react'
import type { FC } from 'react'

export type AgentRole =
  | 'orchestrator'
  | 'data_ingestor'
  | 'analyst'
  | 'researcher'
  | 'critic'
  | 'synthesizer'
  | 'eval'
  | 'delivery'
  | 'watcher'
  | 'escalator'

export const AGENT_ICON_MAP: Record<string, FC<LucideProps>> = {
  orchestrator:  Brain,
  data_ingestor: Inbox,
  analyst:       BarChart,
  researcher:    Search,
  critic:        MessageSquareWarning,
  synthesizer:   Layers,
  eval:          ShieldCheck,
  delivery:      Send,
  watcher:       Eye,
  escalator:     AlertTriangle,
}

export const AGENT_COLOR: Record<string, string> = {
  orchestrator:  'text-violet-500',
  data_ingestor: 'text-blue-500',
  analyst:       'text-amber-500',
  researcher:    'text-indigo-500',
  critic:        'text-rose-500',
  synthesizer:   'text-teal-500',
  eval:          'text-emerald-500',
  delivery:      'text-cyan-500',
  watcher:       'text-slate-400',
  escalator:     'text-orange-500',
}

export const AGENT_LABEL: Record<string, string> = {
  orchestrator:  'Orchestrator',
  data_ingestor: 'Data Ingestor',
  analyst:       'Analyst',
  researcher:    'Researcher',
  critic:        'Critic',
  synthesizer:   'Synthesizer',
  eval:          'Evaluator',
  delivery:      'Delivery',
  watcher:       'Watcher',
  escalator:     'Escalator',
}

export const AGENT_DESC: Record<string, string> = {
  orchestrator:  'Builds the task graph, resolves dependencies, spawns agents in phases, and monitors overall execution state.',
  data_ingestor: 'Connects to external data sources — APIs, spreadsheets, webhooks, scrapers — and normalises output for downstream agents.',
  analyst:       'Applies reasoning and LLM inference to transform raw data into structured insights, scores, and recommendations.',
  researcher:    'Generates targeted search queries, retrieves live web sources via Exa, and synthesises findings into structured output.',
  critic:        'Peer-reviews analyst output, identifies logical gaps and unsupported claims, and returns actionable feedback for revision.',
  synthesizer:   'Merges outputs from multiple upstream agents into a single coherent document with unified voice and structure.',
  eval:          'Quality-gates every analyst output against scoring criteria. Triggers retries with targeted feedback when scores fall below threshold.',
  delivery:      'Formats final output and routes it to configured channels — email, Slack webhook, PDF report, or external API.',
  watcher:       'Monitors ongoing system state, tracks metrics over time, and emits alerts when thresholds are breached.',
  escalator:     'Pauses execution and routes a decision to a human. Resumes the pipeline on approval, or halts on rejection.',
}

/** Render an agent icon; falls back to Bot */
export function AgentIcon({ role, className }: { role: string; className?: string }) {
  const Icon = AGENT_ICON_MAP[role] ?? Bot
  return <Icon className={className} />
}
