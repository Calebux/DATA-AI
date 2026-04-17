'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { WORKFLOW_TEMPLATES, TEMPLATE_CATEGORIES } from '@/data/workflows'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import type { WorkflowTemplate } from '@/types'
import Link from 'next/link'
import {
  TrendingUp, DollarSign, AlertCircle, Search, Target,
  Server, Wand2, Check, ChevronRight, Clock, Webhook,
  Play, CalendarDays, Repeat, Zap, type LucideProps,
} from 'lucide-react'
import type { FC } from 'react'

// ── Icon helpers ──────────────────────────────────────────
const TEMPLATE_ICON_MAP: Record<string, FC<LucideProps>> = {
  TrendingUp, DollarSign, AlertCircle, Search, Target, Server, Wand2,
}
function TemplateIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TEMPLATE_ICON_MAP[name] ?? Wand2
  return <Icon className={className} />
}

// ── Step indicator ────────────────────────────────────────
const STEPS = ['Template', 'Schedule', 'Configure', 'Deploy']

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEPS.map((label, i) => {
        const done    = i < current
        const active  = i === current
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                done   ? 'bg-black text-white' :
                active ? 'bg-black text-white' :
                         'bg-black/8 text-black/30'
              }`}>
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`text-[9px] tracking-[0.1em] uppercase hidden sm:block ${active ? 'text-black font-semibold' : done ? 'text-black/50' : 'text-black/25'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-10 sm:w-16 h-px mb-4 mx-2 transition-colors ${done ? 'bg-black/40' : 'bg-black/10'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Trigger options ───────────────────────────────────────
type TriggerChoice = 'manual' | 'daily' | 'weekly' | 'monthly' | 'webhook'

const TRIGGER_OPTIONS: { value: TriggerChoice; label: string; desc: string; icon: FC<LucideProps> }[] = [
  { value: 'manual',  label: 'Manual',       desc: 'Run on demand from the dashboard',            icon: Play },
  { value: 'daily',   label: 'Daily',        desc: 'Every day at a time you choose',               icon: Repeat },
  { value: 'weekly',  label: 'Weekly',       desc: 'Once a week on a day you choose',              icon: CalendarDays },
  { value: 'monthly', label: 'Monthly',      desc: 'First of every month at a time you choose',    icon: Clock },
  { value: 'webhook', label: 'Webhook',      desc: 'Triggered by an external HTTP POST request',   icon: Webhook },
]

const WEEKDAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const HOURS    = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`)
const TIMEZONES = [
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
  'Europe/London','Europe/Paris','Europe/Berlin','Asia/Tokyo','Asia/Singapore',
  'Australia/Sydney','UTC',
]

function buildCron(trigger: TriggerChoice, hour: string, weekday: string): string {
  const h = hour.split(':')[0]
  if (trigger === 'daily')   return `0 ${h} * * *`
  if (trigger === 'weekly')  return `0 ${h} * * ${WEEKDAYS.indexOf(weekday) + 1}`
  if (trigger === 'monthly') return `0 ${h} 1 * *`
  return ''
}

const CATEGORY_LABELS: Record<string, string> = {
  finance_executive: 'FINANCE', customer_success: 'CUST. SUCCESS',
  sales: 'SALES', marketing: 'MARKETING', product: 'PRODUCT',
  operations: 'OPERATIONS', hr: 'HR', custom: 'CUSTOM',
}

// ─────────────────────────────────────────────────────────
export default function NewWorkflowPage() {
  const { user } = useAuth()
  const router   = useRouter()

  const [step,     setStep]     = useState(0)
  const [category, setCategory] = useState('all')
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null)

  // Step 2 — Schedule
  const [trigger,  setTrigger]  = useState<TriggerChoice>('manual')
  const [hour,     setHour]     = useState('08:00')
  const [weekday,  setWeekday]  = useState('Monday')
  const [timezone, setTimezone] = useState('America/New_York')

  // Step 3 — Configure
  const [wfName,   setWfName]   = useState('')
  const [wfDesc,   setWfDesc]   = useState('')
  const [dataUrls, setDataUrls] = useState<string[]>([''])

  // Step 4 — Deploy
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const filtered = category === 'all'
    ? WORKFLOW_TEMPLATES
    : WORKFLOW_TEMPLATES.filter(t => t.category === category)

  // Has web-scrape data sources
  const hasWebSources = template?.definition.steps.some(
    s => s.data_sources?.some(d => d.type === 'web_scrape')
  ) ?? false

  async function handleDeploy() {
    if (!template || !user) return
    setSaving(true)
    setError('')

    const cronExpr = buildCron(trigger, hour, weekday)
    const definition = {
      ...template.definition,
      name: wfName || template.name,
      trigger: {
        type: trigger === 'webhook' ? 'webhook' : trigger === 'manual' ? 'manual' : 'cron',
        ...(cronExpr ? { cron_expression: cronExpr, timezone } : {}),
      },
    }

    const supabase = getSupabase()
    const { data, error: err } = await supabase
      .from('workflows')
      .insert({
        user_id: user.id,
        name: wfName || template.name,
        category: template.category,
        description: wfDesc || template.description,
        status: 'active',
        definition,
      })
      .select().single()

    if (err) { setError(err.message); setSaving(false); return }
    router.push(`/workflows/${data.id}`)
  }

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 pb-24">

      {/* Page header */}
      <div className="mb-8 pb-4 rule">
        <p className="section-label mb-1.5">
          <Link href="/dashboard" className="hover:text-black/60 transition-colors">Workflows</Link>
          {' / '}New
        </p>
        <h1 className="text-xl font-bold tracking-tight text-black">Create Workflow</h1>
      </div>

      <StepIndicator current={step} />

      {/* ── STEP 1: Template ── */}
      {step === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* Template list */}
          <div className="lg:col-span-3">
            {/* Category filter */}
            <div className="flex gap-5 mb-0 pb-2.5 rule overflow-x-auto">
              {TEMPLATE_CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`text-[9px] tracking-[0.13em] uppercase font-semibold flex-shrink-0 transition-colors ${
                    category === cat.value ? 'text-black' : 'text-black/30 hover:text-black/60'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {filtered.map((t, i) => {
              const isSel = template?.id === t.id
              return (
                <div
                  key={t.id}
                  onClick={() => setTemplate(t)}
                  className={`flex items-center gap-3 py-3 rule cursor-pointer transition-colors ${
                    isSel ? 'row-inverted' : 'hover:bg-black/3'
                  }`}
                >
                  <span className="row-num">{String(i + 1).padStart(2,'0')}.</span>
                  <TemplateIcon
                    name={t.icon}
                    className={`h-3.5 w-3.5 flex-shrink-0 ${isSel ? 'text-white/60' : 'text-black/35'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <span className={`text-[13px] font-semibold tracking-tight ${isSel ? 'text-white' : 'text-black'}`}>
                      {t.name}
                    </span>
                  </div>
                  <span className={`text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 border flex-shrink-0 ${
                    isSel ? 'border-white/20 text-white/50' : 'border-black/12 text-black/35'
                  }`}>
                    {CATEGORY_LABELS[t.category] ?? t.category.toUpperCase()}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Sticky detail panel */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-24">
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

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 py-4 border-t border-b border-black/8">
                    <div className="text-center">
                      <div className="text-lg font-bold text-black">{template.definition.steps.length}</div>
                      <div className="section-label mt-0.5">Agents</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-black">
                        {template.definition.steps.filter(s => s.consensus).length || '—'}
                      </div>
                      <div className="section-label mt-0.5">Consensus</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-black capitalize">
                        {template.triggers[0]}
                      </div>
                      <div className="section-label mt-0.5">Trigger</div>
                    </div>
                  </div>

                  {/* Agent pipeline */}
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

                  <button
                    onClick={() => setStep(1)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-black text-white text-[10px] tracking-[0.14em] uppercase font-semibold hover:bg-black/80 transition-colors"
                  >
                    Use This Template <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="border border-black/8 p-6 text-center">
                  <p className="section-label mb-2">Select a template</p>
                  <p className="text-sm text-black/35 leading-relaxed">
                    Choose a workflow from the list to see its details and agent pipeline.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Schedule ── */}
      {step === 1 && (
        <div className="max-w-xl space-y-6">
          <div>
            <p className="section-label mb-1">Schedule</p>
            <h2 className="text-base font-bold text-black">When should this run?</h2>
          </div>

          <div className="space-y-2">
            {TRIGGER_OPTIONS.map(opt => {
              const Icon = opt.icon
              const active = trigger === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setTrigger(opt.value)}
                  className={`w-full flex items-center gap-4 p-4 border text-left transition-colors ${
                    active ? 'border-black bg-black text-white' : 'border-black/10 hover:border-black/30'
                  }`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${active ? 'text-white/70' : 'text-black/40'}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${active ? 'text-white' : 'text-black'}`}>{opt.label}</div>
                    <div className={`text-xs mt-0.5 ${active ? 'text-white/55' : 'text-black/40'}`}>{opt.desc}</div>
                  </div>
                  {active && <Check className="h-4 w-4 text-white/70 flex-shrink-0" />}
                </button>
              )
            })}
          </div>

          {/* Time picker for scheduled triggers */}
          {(trigger === 'daily' || trigger === 'weekly' || trigger === 'monthly') && (
            <div className="border border-black/10 p-5 space-y-4">
              <p className="section-label">Schedule Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="section-label block mb-1.5">Time</label>
                  <select
                    value={hour}
                    onChange={e => setHour(e.target.value)}
                    className="w-full border border-black/15 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:border-black/40"
                  >
                    {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                {trigger === 'weekly' && (
                  <div>
                    <label className="section-label block mb-1.5">Day</label>
                    <select
                      value={weekday}
                      onChange={e => setWeekday(e.target.value)}
                      className="w-full border border-black/15 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:border-black/40"
                    >
                      {WEEKDAYS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                )}
                <div className={trigger === 'weekly' ? 'col-span-2' : ''}>
                  <label className="section-label block mb-1.5">Timezone</label>
                  <select
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                    className="w-full border border-black/15 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:border-black/40"
                  >
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-black/35 font-mono">
                cron: {buildCron(trigger, hour, weekday) || '—'}
              </p>
            </div>
          )}

          {trigger === 'webhook' && (
            <div className="border border-black/10 p-5">
              <p className="section-label mb-2">Webhook Setup</p>
              <p className="text-sm text-black/50 leading-relaxed">
                After creating, you'll get a unique webhook URL. POST to it from Zapier, Make, Datadog, or any HTTP client to trigger this workflow.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(0)} className="px-5 py-2 border border-black/15 text-[10px] tracking-[0.12em] uppercase text-black/45 hover:text-black hover:border-black/40 transition-colors">
              Back
            </button>
            <button onClick={() => setStep(2)} className="flex items-center gap-2 px-6 py-2 bg-black text-white text-[10px] tracking-[0.14em] uppercase font-semibold hover:bg-black/80 transition-colors">
              Continue <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Configure ── */}
      {step === 2 && (
        <div className="max-w-xl space-y-6">
          <div>
            <p className="section-label mb-1">Configure</p>
            <h2 className="text-base font-bold text-black">Name your workflow</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="section-label block mb-2">Workflow Name</label>
              <input
                value={wfName}
                onChange={e => setWfName(e.target.value)}
                placeholder={template?.name ?? 'My Workflow'}
                className="w-full border border-black/15 px-3 py-2.5 text-sm text-black placeholder-black/30 focus:outline-none focus:border-black/40 bg-transparent"
              />
            </div>
            <div>
              <label className="section-label block mb-2">Description <span className="text-black/25">(optional)</span></label>
              <textarea
                value={wfDesc}
                onChange={e => setWfDesc(e.target.value)}
                placeholder={template?.description ?? 'What does this workflow do?'}
                rows={2}
                className="w-full border border-black/15 px-3 py-2.5 text-sm text-black placeholder-black/30 focus:outline-none focus:border-black/40 bg-transparent resize-none"
              />
            </div>
          </div>

          {/* Data source URLs for web-scrape templates */}
          {hasWebSources && (
            <div className="border border-black/10 p-5 space-y-3">
              <p className="section-label">Data Sources — URLs to Monitor</p>
              {dataUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={url}
                    onChange={e => {
                      const next = [...dataUrls]
                      next[i] = e.target.value
                      setDataUrls(next)
                    }}
                    placeholder="https://competitor.com/pricing"
                    className="flex-1 border border-black/15 px-3 py-2 text-sm text-black placeholder-black/30 focus:outline-none focus:border-black/40 bg-transparent"
                  />
                  {dataUrls.length > 1 && (
                    <button
                      onClick={() => setDataUrls(dataUrls.filter((_, j) => j !== i))}
                      className="px-3 border border-black/10 text-black/30 hover:text-black hover:border-black/30 transition-colors text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setDataUrls([...dataUrls, ''])}
                className="text-[10px] tracking-widest uppercase text-black/35 hover:text-black transition-colors"
              >
                + Add URL
              </button>
            </div>
          )}

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

      {/* ── STEP 4: Deploy ── */}
      {step === 3 && template && (
        <div className="max-w-xl space-y-6">
          <div>
            <p className="section-label mb-1">Review & Deploy</p>
            <h2 className="text-base font-bold text-black">Ready to launch</h2>
          </div>

          {/* Summary card */}
          <div className="border border-black/10 divide-y divide-black/6">
            {[
              { label: 'Workflow',  value: wfName || template.name },
              { label: 'Template',  value: template.name },
              { label: 'Category',  value: CATEGORY_LABELS[template.category] ?? template.category },
              { label: 'Agents',    value: `${template.definition.steps.length} agents across ${template.definition.steps.filter(s => s.depends_on.length === 0).length > 1 ? 'multiple' : 'sequential'} phases` },
              {
                label: 'Trigger',
                value: trigger === 'manual'  ? 'Manual (on demand)' :
                       trigger === 'daily'   ? `Daily at ${hour} ${timezone}` :
                       trigger === 'weekly'  ? `Weekly ${weekday}s at ${hour} ${timezone}` :
                       trigger === 'monthly' ? `Monthly (1st) at ${hour} ${timezone}` :
                                               'Webhook (HTTP POST)',
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-4 px-5 py-3">
                <span className="section-label w-20 flex-shrink-0">{label}</span>
                <span className="text-sm text-black flex-1">{value}</span>
              </div>
            ))}
          </div>

          {/* Agent pipeline preview */}
          <div className="border border-black/10 p-5">
            <p className="section-label mb-3">Agent Pipeline</p>
            <div className="flex items-center gap-1 flex-wrap">
              {template.definition.steps.map((s, i) => (
                <div key={s.step_id} className="flex items-center gap-1">
                  <span className="text-[10px] text-black/50 border border-black/10 px-2 py-0.5 font-mono">
                    {s.agent_role}
                    {s.consensus ? ` ×${s.consensus.agent_count}` : ''}
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
            <button
              onClick={() => setStep(2)}
              disabled={saving}
              className="px-5 py-2 border border-black/15 text-[10px] tracking-[0.12em] uppercase text-black/45 hover:text-black hover:border-black/40 transition-colors disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={handleDeploy}
              disabled={saving}
              className="flex items-center justify-center gap-2 flex-1 py-2.5 bg-black text-white text-[10px] tracking-[0.14em] uppercase font-semibold hover:bg-black/80 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <><Spinner size="sm" className="text-white/60" /> Deploying…</>
              ) : (
                <><Zap className="h-3.5 w-3.5" /> Deploy Workflow</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
