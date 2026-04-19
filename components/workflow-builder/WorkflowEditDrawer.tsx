'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import type { Workflow, McpServer } from '@/types'
import {
  X, Check, Save, Bot, ToggleLeft, ToggleRight,
  Play, Repeat, CalendarDays, Clock, Webhook, Database, RefreshCw,
  type LucideProps,
} from 'lucide-react'
import type { FC } from 'react'

// ── Schedule helpers (shared with wizard) ─────────────────────────────────

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

function generateWebhookSecret(len = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

/** Parse a cron expression back to (hour, weekday) for the UI */
function parseCron(expr: string): { hour: string; weekday: string } {
  const parts = expr.split(' ')
  const h = parts[1] ?? '8'
  const dow = parts[4]
  const weekday = dow && dow !== '*' && dow !== 'MON-FRI'
    ? WEEKDAYS[parseInt(dow) - 1] ?? 'Monday'
    : 'Monday'
  return { hour: `${h.padStart(2,'0')}:00`, weekday }
}

/** Detect trigger choice from definition trigger */
function detectTrigger(workflow: Workflow): TriggerChoice {
  const t = workflow.definition.trigger
  if (t.type === 'webhook') return 'webhook'
  if (t.type === 'manual')  return 'manual'
  if (!t.cron_expression)   return 'manual'
  const parts = t.cron_expression.split(' ')
  if (parts[2] === '1' && parts[3] === '*') return 'monthly'
  if (parts[4] !== '*') return 'weekly'
  return 'daily'
}

// ── Tab types ─────────────────────────────────────────────────────────────

type DrawerTab = 'data' | 'ai' | 'schedule'

interface ConfiguredDataSource {
  type: string
  label?: string
  url?: string
  method?: string
  headers?: Record<string, string>
  bearer_token?: string
  body?: string
  spreadsheet_id?: string
  sheet_name?: string
  _step_id?: string
}

// ── Props ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  workflow: Workflow
  onClose: () => void
  onSaved: (updated: Workflow) => void
}

// ── Component ─────────────────────────────────────────────────────────────

export default function WorkflowEditDrawer({ open, workflow, onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('ai')
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState('')

  // AI Config
  const [wfName,       setWfName]       = useState(workflow.name)
  const [systemPrompt, setSystemPrompt] = useState(workflow.definition.system_prompt ?? '')
  const [mcpServers,   setMcpServers]   = useState<McpServer[]>(
    (workflow.definition.mcp_servers ?? []).map(s => ({ ...s }))
  )

  // Data Sources
  const [dsConfig, setDsConfig] = useState<ConfiguredDataSource[]>(() => {
    const sources: ConfiguredDataSource[] = []
    workflow.definition.steps.forEach(s => {
      s.data_sources?.forEach(ds => {
        sources.push({ ...ds, _step_id: s.step_id })
      })
    })
    return sources
  })

  // Schedule
  const [trigger,       setTrigger]       = useState<TriggerChoice>(detectTrigger(workflow))
  const [timezone,      setTimezone]      = useState(workflow.definition.trigger.timezone ?? 'America/New_York')
  const [webhookSecret, setWebhookSecret] = useState(workflow.definition.webhook_secret ?? '')
  const initCron = workflow.definition.trigger.cron_expression
    ? parseCron(workflow.definition.trigger.cron_expression)
    : { hour: '08:00', weekday: 'Monday' }
  const [hour,    setHour]    = useState(initCron.hour)
  const [weekday, setWeekday] = useState(initCron.weekday)

  // Sync if parent workflow changes (e.g. after a reload)
  useEffect(() => {
    setWfName(workflow.name)
    setSystemPrompt(workflow.definition.system_prompt ?? '')
    setMcpServers((workflow.definition.mcp_servers ?? []).map(s => ({ ...s })))
    
    const sources: ConfiguredDataSource[] = []
    workflow.definition.steps.forEach(s => {
      s.data_sources?.forEach(ds => {
        sources.push({ ...ds, _step_id: s.step_id })
      })
    })
    setDsConfig(sources)
    
    setTrigger(detectTrigger(workflow))
    const tz = workflow.definition.trigger.timezone ?? 'America/New_York'
    setTimezone(tz)
    if (workflow.definition.trigger.cron_expression) {
      const { hour: h, weekday: wd } = parseCron(workflow.definition.trigger.cron_expression)
      setHour(h); setWeekday(wd)
    }
    setWebhookSecret(workflow.definition.webhook_secret ?? '')
  }, [workflow.id])// eslint-disable-line react-hooks/exhaustive-deps

  function toggleMcp(idx: number) {
    setMcpServers(prev => prev.map((s, i) => i === idx ? { ...s, enabled: !s.enabled } : s))
  }

  function updateDsConfig(idx: number, updates: Partial<ConfiguredDataSource>) {
    setDsConfig(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item))
  }

  const showTimePicker = trigger === 'daily' || trigger === 'weekly' || trigger === 'monthly'

  async function handleSave() {
    setSaving(true); setSaved(false); setError('')

    const cronExpr = buildCron(trigger, hour, weekday)
    
    const newSteps = JSON.parse(JSON.stringify(workflow.definition.steps))
    for (const stepConfig of newSteps) {
      const associatedDs = dsConfig.filter(ds => ds._step_id === stepConfig.step_id)
      if (associatedDs.length > 0) {
        stepConfig.data_sources = associatedDs.map(({ _step_id, ...ds }) => ds)
      }
    }

    const updatedDefinition = {
      ...workflow.definition,
      steps: newSteps,
      system_prompt: systemPrompt || undefined,
      mcp_servers: mcpServers.length > 0 ? mcpServers : undefined,
      webhook_secret: trigger === 'webhook' && webhookSecret ? webhookSecret : undefined,
      trigger: {
        type: trigger === 'webhook' ? 'webhook' : trigger === 'manual' ? 'manual' : 'cron',
        ...(cronExpr ? { cron_expression: cronExpr, timezone } : {}),
      },
    }

    const supabase = getSupabase()
    const { data, error: err } = await supabase
      .from('workflows')
      .update({ name: wfName || workflow.name, definition: updatedDefinition })
      .eq('id', workflow.id)
      .select()
      .single()

    setSaving(false)
    if (err) { setError(err.message); return }

    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    onSaved(data as Workflow)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className={`fixed top-0 right-0 h-full z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/8 flex-shrink-0">
          <div>
            <p className="section-label mb-0.5">Workflow</p>
            <h2 className="text-sm font-bold text-black tracking-tight">Edit Configuration</h2>
          </div>
          <button onClick={onClose} className="text-black/30 hover:text-black transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Workflow name */}
        <div className="px-6 pt-5 pb-0 flex-shrink-0">
          <label className="section-label block mb-1.5">Workflow Name</label>
          <input
            value={wfName}
            onChange={e => setWfName(e.target.value)}
            placeholder={workflow.name}
            className="w-full border border-black/15 px-3 py-2 text-sm text-black placeholder-black/30 focus:outline-none focus:border-black/40 bg-transparent"
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-black/8 mt-5 px-6 flex-shrink-0">
          {([['data', 'Data Sources'], ['ai', 'AI Config'], ['schedule', 'Schedule']] as [DrawerTab, string][]).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`mr-6 pb-3 text-[10px] tracking-[0.12em] uppercase font-semibold transition-colors border-b-2 -mb-px ${
                activeTab === tab ? 'text-black border-black' : 'text-black/30 border-transparent hover:text-black/60'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── Data Sources tab ── */}
          {activeTab === 'data' && (
            <>
              {dsConfig.length === 0 ? (
                <div className="border border-black/8 p-5 text-center rounded-xl">
                  <Database className="h-5 w-5 text-black/20 mx-auto mb-2" />
                  <p className="section-label">No Data Sources</p>
                  <p className="text-xs text-black/35 mt-1">This workflow doesn't connect to any external data.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {dsConfig.map((ds, idx) => (
                    <div key={idx} className="bg-white border border-black/10 rounded-xl p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-xs font-mono bg-black/5 text-black/50 px-2 py-0.5 rounded border border-black/10">
                          {ds._step_id}
                        </span>
                        <span className="text-sm font-semibold uppercase tracking-wider text-black">
                          {ds.label || ds.type.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {(ds.type === 'http' || ds.type === 'web_scrape') && (
                        <div className="space-y-3">
                          <div>
                            <label className="section-label block mb-1.5">
                              {ds.type === 'web_scrape' ? 'URL to scrape' : 'API endpoint URL'}
                            </label>
                            <input
                              type="url"
                              className="w-full border border-black/15 bg-transparent px-3 py-2 text-sm focus:border-black/40 outline-none font-mono"
                              placeholder="https://api.example.com/v1/data"
                              value={ds.url || ''}
                              onChange={e => updateDsConfig(idx, { url: e.target.value })}
                            />
                          </div>
                          {ds.type === 'http' && (
                            <div>
                              <label className="section-label block mb-1.5">Bearer Token <span className="text-black/30 normal-case font-normal">(optional)</span></label>
                              <input
                                type="password"
                                className="w-full border border-black/15 bg-transparent px-3 py-2 text-sm focus:border-black/40 outline-none font-mono"
                                placeholder="sk_live_… or Bearer token"
                                value={ds.bearer_token || ''}
                                onChange={e => updateDsConfig(idx, { bearer_token: e.target.value })}
                              />
                              <p className="text-[10px] text-black/30 mt-1">Sent as <code className="bg-black/5 px-0.5">Authorization: Bearer …</code> header</p>
                            </div>
                          )}
                        </div>
                      )}

                      {ds.type === 'google_sheets' && (
                        <div>
                          <label className="section-label block mb-1.5">Spreadsheet ID</label>
                          <input
                            type="text"
                            className="w-full border border-black/15 bg-black/5 px-3 py-2 text-sm font-mono focus:border-black/40 outline-none"
                            value={ds.spreadsheet_id || ''}
                            onChange={e => updateDsConfig(idx, { spreadsheet_id: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── AI Config tab ── */}
          {activeTab === 'ai' && (
            <>
              <div>
                <label className="section-label block mb-1">System Prompt</label>
                <p className="text-xs text-black/40 mb-3 leading-relaxed">
                  Defines the agent's role, behaviour, and output format.
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  rows={9}
                  className="w-full border border-black/15 px-3 py-2.5 text-sm text-black placeholder-black/30 focus:outline-none focus:border-black/40 bg-transparent resize-y font-mono leading-relaxed"
                  placeholder="You are a helpful AI agent..."
                />
                <p className="text-[10px] text-black/30 mt-1 text-right">{systemPrompt.length} chars</p>
              </div>

              {mcpServers.length > 0 && (
                <div>
                  <label className="section-label block mb-1">MCP Servers</label>
                  <p className="text-xs text-black/40 mb-3 leading-relaxed">
                    Toggle off servers you haven't configured yet.
                  </p>
                  <div className="space-y-2">
                    {mcpServers.map((server, idx) => (
                      <div key={server.name}
                        className={`flex items-start gap-3 p-4 border transition-colors ${server.enabled ? 'border-black/20 bg-black/[0.02]' : 'border-black/8 opacity-50'}`}>
                        <div className="w-6 h-6 border border-black/12 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Bot className="h-3 w-3 text-black/40" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-black">{server.label}</span>
                            <code className="text-[10px] text-black/30 font-mono">{server.name}</code>
                          </div>
                          <p className="text-xs text-black/40 mt-0.5">{server.description}</p>
                          <p className="text-[10px] text-black/25 font-mono mt-1 truncate">{server.url}</p>
                        </div>
                        <button onClick={() => toggleMcp(idx)} className="flex-shrink-0 mt-0.5 transition-colors" aria-label={server.enabled ? 'Disable' : 'Enable'}>
                          {server.enabled
                            ? <ToggleRight className="h-5 w-5 text-black" />
                            : <ToggleLeft className="h-5 w-5 text-black/25" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {mcpServers.length === 0 && (
                <div className="border border-black/8 p-5 text-center">
                  <Bot className="h-5 w-5 text-black/20 mx-auto mb-2" />
                  <p className="section-label">No MCP servers</p>
                  <p className="text-xs text-black/35 mt-1">This workflow uses built-in tools only.</p>
                </div>
              )}
            </>
          )}

          {/* ── Schedule tab ── */}
          {activeTab === 'schedule' && (
            <>
              <div>
                <label className="section-label block mb-3">Trigger</label>
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

              {showTimePicker && (
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
              )}

              {trigger === 'webhook' && (
                <div className="border border-black/10 p-5 space-y-4">
                  <div>
                    <p className="section-label mb-1.5">Webhook URL</p>
                    <p className="text-xs font-mono text-black/60 break-all bg-black/[0.03] border border-black/8 px-3 py-2">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/{workflow.id}
                    </p>
                  </div>
                  <div>
                    <label className="section-label block mb-1.5">
                      Secret Token <span className="text-black/30 normal-case font-normal">(optional)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 border border-black/15 bg-transparent px-3 py-2 text-sm font-mono focus:border-black/40 outline-none"
                        placeholder="Leave blank for no auth"
                        value={webhookSecret}
                        onChange={e => setWebhookSecret(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setWebhookSecret(generateWebhookSecret())}
                        className="px-3 py-2 border border-black/15 text-black/40 hover:text-black hover:border-black/30 transition-colors"
                        title="Generate random secret"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-[10px] text-black/30 mt-1">
                      Send as <code className="bg-black/5 px-0.5">X-Webhook-Secret</code> header. Save to persist.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-black/8 px-6 py-4 flex items-center gap-3">
          {error && <p className="flex-1 text-xs text-red-600">{error}</p>}
          {!error && <span className="flex-1" />}
          <button onClick={onClose} className="px-4 py-2 text-[10px] tracking-[0.12em] uppercase text-black/40 hover:text-black border border-black/12 hover:border-black/30 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-black text-white text-[10px] tracking-[0.14em] uppercase font-semibold hover:bg-black/80 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <><Spinner size="sm" className="text-white/60" /> Saving…</>
            ) : saved ? (
              <><Check className="h-3.5 w-3.5" /> Saved</>
            ) : (
              <><Save className="h-3.5 w-3.5" /> Save Changes</>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
