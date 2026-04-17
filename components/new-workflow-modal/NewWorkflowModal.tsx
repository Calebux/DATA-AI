'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { WORKFLOW_TEMPLATES, TEMPLATE_CATEGORIES } from '@/data/workflows'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { WorkflowTemplate, McpServer } from '@/types'
import {
  TrendingUp, DollarSign, AlertCircle, Search, Target, Server, Wand2,
  MessageSquare, BarChart2, UserSearch,
  Check, ChevronRight, Clock, Webhook, Play, CalendarDays, Repeat, Zap, X,
  Copy, ExternalLink, ToggleLeft, ToggleRight, Bot,
  type LucideProps,
} from 'lucide-react'
import type { FC } from 'react'

// ── Icon helpers ───────────────────────────────────────────────────────────

const TEMPLATE_ICON_MAP: Record<string, FC<LucideProps>> = {
  TrendingUp, DollarSign, AlertCircle, Search, Target, Server, Wand2,
  MessageSquare, BarChart2, UserSearch,
}
function TemplateIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TEMPLATE_ICON_MAP[name] ?? Wand2
  return <Icon className={className} />
}

// ── Wizard steps ───────────────────────────────────────────────────────────

const STEPS = ['Template', 'Configure', 'Schedule', 'Deploy']

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
              i <= current ? 'bg-black text-white' : 'bg-black/8 text-black/30'
            }`}>
              {i < current ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span className={`text-[9px] tracking-[0.1em] uppercase hidden sm:block ${
              i === current ? 'text-black font-semibold' : i < current ? 'text-black/50' : 'text-black/25'
            }`}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-10 sm:w-14 h-px mb-4 mx-2 transition-colors ${i < current ? 'bg-black/40' : 'bg-black/10'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Schedule helpers ───────────────────────────────────────────────────────

type TriggerChoice = 'manual' | 'daily' | 'weekly' | 'monthly' | 'webhook'

const TRIGGER_OPTIONS: { value: TriggerChoice; label: string; desc: string; icon: FC<LucideProps> }[] = [
  { value: 'manual',  label: 'Manual',   desc: 'Run on demand from dashboard', icon: Play },
  { value: 'daily',   label: 'Daily',    desc: 'Every day at a chosen time',    icon: Repeat },
  { value: 'weekly',  label: 'Weekly',   desc: 'Once a week, day you choose',   icon: CalendarDays },
  { value: 'monthly', label: 'Monthly',  desc: '1st of every month',            icon: Clock },
  { value: 'webhook', label: 'Webhook',  desc: 'External HTTP POST trigger',    icon: Webhook },
]

const WEEKDAYS  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const HOURS     = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`)
const TIMEZONES = [
  'America/New_York','America/Chicago','America/Los_Angeles',
  'Europe/London','Europe/Paris','Asia/Tokyo','Asia/Singapore','UTC',
]

function buildCron(t: TriggerChoice, hour: string, weekday: string): string {
  const h = hour.split(':')[0]
  if (t === 'daily')   return `0 ${h} * * *`
  if (t === 'weekly')  return `0 ${h} * * ${WEEKDAYS.indexOf(weekday) + 1}`
  if (t === 'monthly') return `0 ${h} 1 * *`
  return ''
}

function generateSecret(len = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const CATEGORY_LABELS: Record<string, string> = {
  finance_executive: 'FINANCE', customer_success: 'CUST. SUCCESS',
  sales: 'SALES', marketing: 'MARKETING', product: 'PRODUCT',
  operations: 'OPERATIONS', hr: 'HR', custom: 'CUSTOM',
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (workflowId: string) => void
}

// ── Component ──────────────────────────────────────────────────────────────

export default function NewWorkflowModal({ open, onClose, onCreated }: Props) {
  const { user } = useAuth()

  // Wizard state
  const [step,     setStep]     = useState(0)
  const [category, setCategory] = useState('all')
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null)
  const [wfName,   setWfName]   = useState('')

  // Configure step state
  const [systemPrompt, setSystemPrompt] = useState('')
  const [mcpServers,   setMcpServers]   = useState<McpServer[]>([])

  // Schedule step state
  const [trigger,  setTrigger]  = useState<TriggerChoice>('manual')
  const [hour,     setHour]     = useState('08:00')
  const [weekday,  setWeekday]  = useState('Monday')
  const [timezone, setTimezone] = useState('America/New_York')

  // Deploy state
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [createdId,    setCreatedId]    = useState<string | null>(null)
  const [webhookSecret] = useState(() => generateSecret())
  const [copiedUrl,    setCopiedUrl]    = useState(false)

  const filtered = category === 'all'
    ? WORKFLOW_TEMPLATES
    : WORKFLOW_TEMPLATES.filter(t => t.category === category)

  const showTimePicker = trigger === 'daily' || trigger === 'weekly' || trigger === 'monthly'

  // Pre-fill Configure step from template
  function selectTemplate(t: WorkflowTemplate) {
    setTemplate(t)
    setSystemPrompt(t.system_prompt ?? '')
    setMcpServers(
      (t.mcp_servers ?? []).map(s => ({ ...s, enabled: true }))
    )
    // Pre-select trigger from template defaults
    const defaultTrigger = t.triggers[0]
    if (defaultTrigger === 'manual' || defaultTrigger === 'webhook') {
      setTrigger(defaultTrigger as TriggerChoice)
    } else if (defaultTrigger === 'cron') {
      setTrigger('daily')
    }
  }

  function toggleMcp(idx: number) {
    setMcpServers(prev => prev.map((s, i) => i === idx ? { ...s, enabled: !s.enabled } : s))
  }

  function handleClose() {
    setStep(0); setTemplate(null); setWfName(''); setTrigger('manual')
    setSystemPrompt(''); setMcpServers([])
    setError(''); setSaving(false); setCreatedId(null)
    onClose()
  }

  async function handleDeploy() {
    if (!template || !user) return
    setSaving(true); setError('')

    const cronExpr = buildCron(trigger, hour, weekday)
    const definition = {
      ...template.definition,
      name: wfName || template.name,
      trigger: {
        type: trigger === 'webhook' ? 'webhook' : trigger === 'manual' ? 'manual' : 'cron',
        ...(cronExpr ? { cron_expression: cronExpr, timezone } : {}),
      },
      // AI config fields — no longer silently dropped
      system_prompt: systemPrompt || undefined,
      mcp_servers: mcpServers.filter(s => s.enabled).length > 0
        ? mcpServers.filter(s => s.enabled)
        : undefined,
      // Webhook secret (only relevant for webhook trigger)
      ...(trigger === 'webhook' ? { webhook_secret: webhookSecret } : {}),
    }

    const supabase = getSupabase()
    const { data, error: err } = await supabase
      .from('workflows')
      .insert({
        user_id: user.id,
        name: wfName || template.name,
        category: template.category,
        description: template.description,
        status: 'active',
        definition,
      })
      .select().single()

    if (err) { setError(err.message); setSaving(false); return }

    if (trigger === 'webhook') {
      // Stay on deploy step to show the webhook URL
      setCreatedId(data.id)
      setSaving(false)
    } else {
      handleClose()
      onCreated(data.id)
    }
  }

  function handleDone() {
    if (createdId) onCreated(createdId)
    handleClose()
  }

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-7 pt-7 pb-5 border-b border-black/8">
          <div className="flex items-center justify-between">
            <div>
              <p className="section-label mb-1">Workspace</p>
              <DialogTitle className="text-lg font-bold tracking-tight text-black">Create Workflow</DialogTitle>
            </div>
            <button onClick={handleClose} className="text-black/25 hover:text-black transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-5">
            <StepIndicator current={step} />
          </div>
        </DialogHeader>

        <div className="px-7 py-6">

          {/* ── STEP 0: Template ── */}
          {step === 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              <div className="lg:col-span-3">
                <div className="flex gap-5 pb-2.5 rule overflow-x-auto mb-0">
                  {TEMPLATE_CATEGORIES.map(cat => (
                    <button key={cat.value} onClick={() => setCategory(cat.value)}
                      className={`text-[9px] tracking-[0.13em] uppercase font-semibold flex-shrink-0 transition-colors ${category === cat.value ? 'text-black' : 'text-black/30 hover:text-black/60'}`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
                {filtered.map((t, i) => {
                  const isSel = template?.id === t.id
                  return (
                    <div key={t.id} onClick={() => selectTemplate(t)}
                      className={`flex items-center gap-3 py-3 rule cursor-pointer transition-colors ${isSel ? 'row-inverted' : 'hover:bg-black/3'}`}>
                      <span className="row-num">{String(i + 1).padStart(2,'0')}.</span>
                      <TemplateIcon name={t.icon} className={`h-3.5 w-3.5 flex-shrink-0 ${isSel ? 'text-white/60' : 'text-black/35'}`} />
                      <span className={`text-[13px] font-semibold tracking-tight flex-1 ${isSel ? 'text-white' : 'text-black'}`}>{t.name}</span>
                      {t.mcp_servers && t.mcp_servers.length > 0 && (
                        <span className={`text-[9px] tracking-[0.1em] uppercase px-1.5 py-0.5 border flex-shrink-0 ${isSel ? 'border-white/20 text-white/40' : 'border-black/12 text-black/30'}`}>
                          MCP
                        </span>
                      )}
                      <span className={`text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 border flex-shrink-0 ${isSel ? 'border-white/20 text-white/50' : 'border-black/12 text-black/35'}`}>
                        {CATEGORY_LABELS[t.category] ?? t.category.toUpperCase()}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="lg:col-span-2">
                {template ? (
                  <div className="border border-black/10 p-6 space-y-5">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 border border-black/10 flex items-center justify-center flex-shrink-0">
                        <TemplateIcon name={template.icon} className="h-4 w-4 text-black/50" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-black">{template.name}</h2>
                        <span className="section-label">{CATEGORY_LABELS[template.category]}</span>
                      </div>
                    </div>
                    <p className="text-sm text-black/55 leading-relaxed">{template.description}</p>
                    <div className="grid grid-cols-3 gap-3 py-4 border-t border-b border-black/8 text-center">
                      <div>
                        <div className="text-lg font-bold text-black">{template.definition.steps.length}</div>
                        <div className="section-label mt-0.5">Agents</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-black">
                          {template.definition.steps.filter(s => s.consensus).length || '—'}
                        </div>
                        <div className="section-label mt-0.5">Consensus</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-black capitalize">{template.triggers[0]}</div>
                        <div className="section-label mt-0.5">Trigger</div>
                      </div>
                    </div>

                    {/* MCP servers badge */}
                    {template.mcp_servers && template.mcp_servers.length > 0 && (
                      <div>
                        <p className="section-label mb-2">MCP Servers</p>
                        <div className="flex flex-wrap gap-1.5">
                          {template.mcp_servers.map(s => (
                            <span key={s.name} className="text-[10px] text-black/55 border border-black/10 px-2 py-0.5">
                              {s.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="section-label mb-2">Pipeline</p>
                      <div className="space-y-1.5">
                        {template.definition.steps.map((s, i) => (
                          <div key={s.step_id} className="flex items-center gap-2 text-xs">
                            <span className="text-black/20 w-4 text-right flex-shrink-0">{i + 1}</span>
                            <span className="text-black/55 font-mono flex-1 truncate">{s.step_id.replace(/_/g, ' ')}</span>
                            <Badge variant="muted" className="text-[9px]">{s.agent_role}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setStep(1)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-black text-white text-[10px] tracking-[0.14em] uppercase font-semibold hover:bg-black/80 transition-colors">
                      Use This Template <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="border border-black/8 p-6 text-center">
                    <p className="section-label mb-2">Select a template</p>
                    <p className="text-sm text-black/35 leading-relaxed">Choose a workflow to see its details.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 1: Configure (system_prompt + MCP servers) ── */}
          {step === 1 && template && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <p className="section-label mb-1">AI Configuration</p>
                <h2 className="text-sm font-bold text-black mb-0.5">System Prompt</h2>
                <p className="text-xs text-black/40 mb-3 leading-relaxed">
                  Defines the agent's role, behaviour, and output format. Pre-filled from the template — customise to match your stack.
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  rows={8}
                  className="w-full border border-black/15 px-3 py-2.5 text-sm text-black placeholder-black/30 focus:outline-none focus:border-black/40 bg-transparent resize-y font-mono leading-relaxed"
                  placeholder="You are a helpful AI agent..."
                />
                <p className="text-[10px] text-black/30 mt-1 text-right">{systemPrompt.length} chars</p>
              </div>

              {/* MCP servers — only shown if template defines them */}
              {mcpServers.length > 0 && (
                <div>
                  <p className="section-label mb-1">MCP Servers</p>
                  <p className="text-xs text-black/40 mb-3 leading-relaxed">
                    External tool servers this agent can call. Toggle off any you haven't configured yet.
                  </p>
                  <div className="space-y-2">
                    {mcpServers.map((server, idx) => (
                      <div key={server.name}
                        className={`flex items-start gap-3 p-4 border transition-colors ${server.enabled ? 'border-black/20 bg-black/[0.02]' : 'border-black/8 opacity-50'}`}>
                        <div className="w-7 h-7 border border-black/12 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Bot className="h-3.5 w-3.5 text-black/40" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-black">{server.label}</span>
                            <code className="text-[10px] text-black/30 font-mono">{server.name}</code>
                          </div>
                          <p className="text-xs text-black/40 mt-0.5">{server.description}</p>
                          <p className="text-[10px] text-black/25 font-mono mt-1 truncate">{server.url}</p>
                        </div>
                        <button
                          onClick={() => toggleMcp(idx)}
                          className="flex-shrink-0 mt-0.5 transition-colors"
                          aria-label={server.enabled ? 'Disable' : 'Enable'}
                        >
                          {server.enabled
                            ? <ToggleRight className="h-5 w-5 text-black" />
                            : <ToggleLeft className="h-5 w-5 text-black/25" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty MCP state */}
              {mcpServers.length === 0 && (
                <div className="border border-black/8 p-5 text-center">
                  <Bot className="h-5 w-5 text-black/20 mx-auto mb-2" />
                  <p className="section-label">No MCP servers</p>
                  <p className="text-xs text-black/35 mt-1">This template uses built-in tools only.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(0)} className="px-5 py-2 border border-black/15 text-[10px] tracking-[0.12em] uppercase text-black/45 hover:text-black hover:border-black/40 transition-colors">
                  Back
                </button>
                <button onClick={() => setStep(2)} className="flex items-center gap-2 px-6 py-2 bg-black text-white text-[10px] tracking-[0.14em] uppercase font-semibold hover:bg-black/80 transition-colors">
                  Schedule <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Schedule + Name ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="max-w-sm">
                <label className="section-label block mb-2">Workflow Name</label>
                <input
                  value={wfName}
                  onChange={e => setWfName(e.target.value)}
                  placeholder={template?.name ?? 'My Workflow'}
                  className="w-full border border-black/15 px-3 py-2.5 text-sm text-black placeholder-black/30 focus:outline-none focus:border-black/40 bg-transparent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
                <div>
                  <p className="section-label mb-3">When should this run?</p>
                  <div className="space-y-2">
                    {TRIGGER_OPTIONS.map(opt => {
                      const Icon   = opt.icon
                      const active = trigger === opt.value
                      return (
                        <button key={opt.value} onClick={() => setTrigger(opt.value)}
                          className={`w-full flex items-center gap-3 p-3.5 border text-left transition-colors ${active ? 'border-black bg-black text-white' : 'border-black/10 hover:border-black/30'}`}>
                          <Icon className={`h-4 w-4 flex-shrink-0 ${active ? 'text-white/70' : 'text-black/40'}`} />
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-semibold ${active ? 'text-white' : 'text-black'}`}>{opt.label}</div>
                            <div className={`text-xs mt-0.5 ${active ? 'text-white/55' : 'text-black/40'}`}>{opt.desc}</div>
                          </div>
                          {active && <Check className="h-3.5 w-3.5 text-white/70 flex-shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  {showTimePicker ? (
                    <div className="border border-black/10 p-5 space-y-4">
                      <p className="section-label">Schedule Details</p>
                      <div>
                        <label className="section-label block mb-1.5">Time</label>
                        <select value={hour} onChange={e => setHour(e.target.value)}
                          className="w-full border border-black/15 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:border-black/40">
                          {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      {trigger === 'weekly' && (
                        <div>
                          <label className="section-label block mb-1.5">Day of week</label>
                          <select value={weekday} onChange={e => setWeekday(e.target.value)}
                            className="w-full border border-black/15 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:border-black/40">
                            {WEEKDAYS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="section-label block mb-1.5">Timezone</label>
                        <select value={timezone} onChange={e => setTimezone(e.target.value)}
                          className="w-full border border-black/15 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:border-black/40">
                          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                      </div>
                      <div className="bg-black/[0.03] border border-black/8 px-3 py-2">
                        <p className="text-[10px] text-black/35">cron expression</p>
                        <p className="text-xs font-mono text-black mt-0.5">{buildCron(trigger, hour, weekday)}</p>
                      </div>
                    </div>
                  ) : trigger === 'webhook' ? (
                    <div className="border border-black/10 p-5 space-y-3">
                      <p className="section-label">Webhook Setup</p>
                      <p className="text-sm text-black/50 leading-relaxed">
                        After deploying, you'll get a unique URL and secret. POST to it from Zapier, Make, Datadog, or any HTTP client to trigger this workflow.
                      </p>
                      <div className="bg-black/[0.03] border border-black/8 px-3 py-2">
                        <p className="text-[10px] text-black/35 font-mono">POST /api/webhook/&#123;id&#125;</p>
                        <p className="text-[10px] text-black/30 mt-1">X-Webhook-Secret: ••••</p>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-black/10 p-5 space-y-3">
                      <p className="section-label">Manual Trigger</p>
                      <p className="text-sm text-black/50 leading-relaxed">
                        This workflow runs when you click <strong>Run</strong> from the dashboard or workflow detail page.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(1)} className="px-5 py-2 border border-black/15 text-[10px] tracking-[0.12em] uppercase text-black/45 hover:text-black hover:border-black/40 transition-colors">
                  Back
                </button>
                <button onClick={() => setStep(3)} className="flex items-center gap-2 px-6 py-2 bg-black text-white text-[10px] tracking-[0.14em] uppercase font-semibold hover:bg-black/80 transition-colors">
                  Review <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Deploy / Review ── */}
          {step === 3 && template && (
            <div className="max-w-xl space-y-6">
              {!createdId ? (
                <>
                  <div>
                    <p className="section-label mb-1">Review & Deploy</p>
                    <h2 className="text-base font-bold text-black">Ready to launch</h2>
                  </div>

                  <div className="border border-black/10 divide-y divide-black/6">
                    {[
                      { label: 'Workflow',  value: wfName || template.name },
                      { label: 'Template',  value: template.name },
                      { label: 'Agents',    value: `${template.definition.steps.length} agents` },
                      {
                        label: 'Trigger',
                        value: trigger === 'manual'  ? 'Manual — run on demand' :
                               trigger === 'daily'   ? `Daily at ${hour} (${timezone})` :
                               trigger === 'weekly'  ? `Every ${weekday} at ${hour} (${timezone})` :
                               trigger === 'monthly' ? `Monthly on the 1st at ${hour} (${timezone})` :
                                                       'Webhook (HTTP POST)',
                      },
                      {
                        label: 'AI Config',
                        value: systemPrompt ? `Custom (${systemPrompt.length} chars)` : 'Template default',
                      },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center gap-4 px-5 py-3">
                        <span className="section-label w-20 flex-shrink-0">{label}</span>
                        <span className="text-sm text-black">{value}</span>
                      </div>
                    ))}

                    {mcpServers.filter(s => s.enabled).length > 0 && (
                      <div className="flex items-start gap-4 px-5 py-3">
                        <span className="section-label w-20 flex-shrink-0 mt-0.5">MCP</span>
                        <div className="flex flex-wrap gap-1.5">
                          {mcpServers.filter(s => s.enabled).map(s => (
                            <span key={s.name} className="text-[10px] text-black border border-black/12 px-2 py-0.5">{s.label}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border border-black/10 p-5">
                    <p className="section-label mb-3">Agent Pipeline</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {template.definition.steps.map((s, i) => (
                        <div key={s.step_id} className="flex items-center gap-1">
                          <span className="text-[10px] text-black/50 border border-black/10 px-2 py-0.5 font-mono">
                            {s.agent_role}{s.consensus ? ` ×${s.consensus.agent_count}` : ''}
                          </span>
                          {i < template.definition.steps.length - 1 && (
                            <ChevronRight className="h-3 w-3 text-black/20 flex-shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {error && <p className="text-xs text-red-600">{error}</p>}

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setStep(2)} disabled={saving}
                      className="px-5 py-2 border border-black/15 text-[10px] tracking-[0.12em] uppercase text-black/45 hover:text-black hover:border-black/40 transition-colors disabled:opacity-40">
                      Back
                    </button>
                    <button onClick={handleDeploy} disabled={saving}
                      className="flex items-center justify-center gap-2 flex-1 py-2.5 bg-black text-white text-[10px] tracking-[0.14em] uppercase font-semibold hover:bg-black/80 transition-colors disabled:opacity-50">
                      {saving
                        ? <><Spinner size="sm" className="text-white/60" /> Deploying…</>
                        : <><Zap className="h-3.5 w-3.5" /> Deploy Workflow</>}
                    </button>
                  </div>
                </>
              ) : (
                /* ── Post-deploy: show webhook URL ── */
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-black/[0.06] border border-black/10 flex items-center justify-center">
                      <Check className="h-4 w-4 text-black" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-black">Workflow deployed</p>
                      <p className="text-xs text-black/40">Ready to receive webhook triggers</p>
                    </div>
                  </div>

                  <div className="border border-black/10 p-5 space-y-4">
                    <p className="section-label">Webhook Endpoint</p>
                    <div className="bg-black/[0.03] border border-black/8 p-3 space-y-2">
                      <p className="text-[10px] text-black/35">POST URL</p>
                      <p className="text-xs font-mono text-black/70 break-all">
                        {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/{createdId}
                      </p>
                    </div>
                    <div className="bg-black/[0.03] border border-black/8 p-3 space-y-2">
                      <p className="text-[10px] text-black/35">X-Webhook-Secret</p>
                      <p className="text-xs font-mono text-black/70 break-all">{webhookSecret}</p>
                    </div>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(webhookSecret)
                        setCopiedUrl(true)
                        setTimeout(() => setCopiedUrl(false), 2000)
                      }}
                      className="flex items-center gap-2 text-[10px] tracking-[0.12em] uppercase text-black/45 hover:text-black transition-colors"
                    >
                      {copiedUrl ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedUrl ? 'Copied!' : 'Copy secret'}
                    </button>
                    <p className="text-[10px] text-black/30 leading-relaxed">
                      Save these — the secret is only shown once. Send it as the <code className="font-mono bg-black/5 px-1">X-Webhook-Secret</code> header with every request.
                    </p>
                  </div>

                  <button onClick={handleDone}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-black text-white text-[10px] tracking-[0.14em] uppercase font-semibold hover:bg-black/80 transition-colors">
                    Open Workflow <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  )
}
