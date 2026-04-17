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
  TrendingUp, DollarSign, AlertCircle, Search, Target, Server, Wand2,
  Check, ChevronRight, Clock, Webhook, Play, CalendarDays, Repeat, Zap,
  type LucideProps,
} from 'lucide-react'
import type { FC } from 'react'

// ── Icons ─────────────────────────────────────────────────
const TEMPLATE_ICON_MAP: Record<string, FC<LucideProps>> = {
  TrendingUp, DollarSign, AlertCircle, Search, Target, Server, Wand2,
}
function TemplateIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TEMPLATE_ICON_MAP[name] ?? Wand2
  return <Icon className={className} />
}

// ── Step indicator ────────────────────────────────────────
const STEPS = ['Template', 'Schedule', 'Deploy']

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
              i < current ? 'bg-black text-white' : i === current ? 'bg-black text-white' : 'bg-black/8 text-black/30'
            }`}>
              {i < current ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span className={`text-[9px] tracking-[0.1em] uppercase hidden sm:block ${
              i === current ? 'text-black font-semibold' : i < current ? 'text-black/50' : 'text-black/25'
            }`}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-12 sm:w-20 h-px mb-4 mx-2 transition-colors ${i < current ? 'bg-black/40' : 'bg-black/10'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Trigger config ────────────────────────────────────────
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

  // Step 2
  const [wfName,   setWfName]   = useState('')
  const [trigger,  setTrigger]  = useState<TriggerChoice>('manual')
  const [hour,     setHour]     = useState('08:00')
  const [weekday,  setWeekday]  = useState('Monday')
  const [timezone, setTimezone] = useState('America/New_York')

  // Step 3
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const filtered = category === 'all'
    ? WORKFLOW_TEMPLATES
    : WORKFLOW_TEMPLATES.filter(t => t.category === category)

  const showTimePicker = trigger === 'daily' || trigger === 'weekly' || trigger === 'monthly'

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
        description: template.description,
        status: 'active',
        definition,
      })
      .select().single()
    if (err) { setError(err.message); setSaving(false); return }
    router.push(`/workflows/${data.id}`)
  }

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 pb-24">

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
                <div key={t.id} onClick={() => setTemplate(t)}
                  className={`flex items-center gap-3 py-3 rule cursor-pointer transition-colors ${isSel ? 'row-inverted' : 'hover:bg-black/3'}`}>
                  <span className="row-num">{String(i + 1).padStart(2,'0')}.</span>
                  <TemplateIcon name={t.icon} className={`h-3.5 w-3.5 flex-shrink-0 ${isSel ? 'text-white/60' : 'text-black/35'}`} />
                  <span className={`text-[13px] font-semibold tracking-tight flex-1 ${isSel ? 'text-white' : 'text-black'}`}>{t.name}</span>
                  <span className={`text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 border flex-shrink-0 ${isSel ? 'border-white/20 text-white/50' : 'border-black/12 text-black/35'}`}>
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
        </div>
      )}

      {/* ── STEP 2: Schedule + Name ── */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Workflow name */}
          <div className="max-w-sm">
            <label className="section-label block mb-2">Workflow Name</label>
            <input
              value={wfName}
              onChange={e => setWfName(e.target.value)}
              placeholder={template?.name ?? 'My Workflow'}
              className="w-full border border-black/15 px-3 py-2.5 text-sm text-black placeholder-black/30 focus:outline-none focus:border-black/40 bg-transparent"
            />
          </div>

          {/* Side-by-side: trigger options LEFT, details RIGHT */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">

            {/* Trigger options */}
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

            {/* Details panel — appears beside trigger options */}
            <div className="sm:sticky sm:top-24">
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
                    After deploying, you'll receive a unique webhook URL. POST to it from Zapier, Make, Datadog, or any HTTP client to trigger this workflow instantly.
                  </p>
                  <div className="bg-black/[0.03] border border-black/8 px-3 py-2">
                    <p className="text-[10px] text-black/35 font-mono">POST /api/webhooks/&#123;id&#125;</p>
                  </div>
                </div>
              ) : (
                <div className="border border-black/10 p-5 space-y-3">
                  <p className="section-label">Manual Trigger</p>
                  <p className="text-sm text-black/50 leading-relaxed">
                    This workflow runs when you click <strong>Run</strong> from the dashboard or workflow detail page. Perfect for on-demand reports.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(0)} className="px-5 py-2 border border-black/15 text-[10px] tracking-[0.12em] uppercase text-black/45 hover:text-black hover:border-black/40 transition-colors">
              Back
            </button>
            <button onClick={() => setStep(2)} className="flex items-center gap-2 px-6 py-2 bg-black text-white text-[10px] tracking-[0.14em] uppercase font-semibold hover:bg-black/80 transition-colors">
              Review <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Deploy ── */}
      {step === 2 && template && (
        <div className="max-w-xl space-y-6">
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
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-4 px-5 py-3">
                <span className="section-label w-20 flex-shrink-0">{label}</span>
                <span className="text-sm text-black">{value}</span>
              </div>
            ))}
          </div>

          {/* Pipeline preview */}
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
            <button onClick={() => setStep(1)} disabled={saving}
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
        </div>
      )}
    </div>
  )
}
