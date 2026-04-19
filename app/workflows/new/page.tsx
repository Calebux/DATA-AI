'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { WORKFLOW_TEMPLATES, TEMPLATE_CATEGORIES } from '@/data/workflows'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import type { WorkflowTemplate, McpServer, DataSource } from '@/types'
import {
  TrendingUp, DollarSign, AlertCircle, Search, Target, Server, Wand2,
  MessageSquare, BarChart2, UserSearch, Database, FileSpreadsheet,
  Check, ChevronRight, Clock, Webhook, Play, CalendarDays, Repeat, Zap,
  Copy, ExternalLink, ToggleLeft, ToggleRight, Bot, ArrowLeft, Globe,
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

const STEPS = ['Select Template', 'Data Sources', 'AI Config', 'Schedule', 'Deploy']

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center w-full max-w-4xl mx-auto mb-12 mt-6">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-2 relative z-10 w-8">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
              i === current ? 'bg-black text-white shadow-md scale-110' :
              i < current ? 'bg-black text-white' : 'bg-black/5 text-black/30 border border-black/10'
            }`}>
              {i < current ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-[10px] tracking-[0.1em] uppercase whitespace-nowrap absolute top-10 transition-colors ${
              i === current ? 'text-black font-bold' : i < current ? 'text-black/60 font-medium' : 'text-black/30'
            }`}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="flex-1 h-px mx-4 relative top-[-10px]">
              <div className="absolute inset-0 bg-black/10" />
              <div
                className="absolute inset-0 bg-black transition-all duration-500 ease-out"
                style={{ width: i < current ? '100%' : '0%' }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── Types for Data Source Config ───────────────────────────────────────────

type DsUiMode = 'api' | 'sheets' | 'csv'

interface ConfiguredDataSource extends DataSource {
  _step_id?: string // Track which step this source belongs to
  _ui_mode?: DsUiMode // UI-only: which input mode the user chose
}

function extractSheetId(input: string): string {
  // Accept full Google Sheets URL or raw ID
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : input
}

// ── Component ──────────────────────────────────────────────────────────────

export default function NewWorkflowPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth')
  }, [user, authLoading, router])

  // Wizard state
  const [step,     setStep]     = useState(0)
  const [category, setCategory] = useState('all')
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null)
  
  // Data Source Step State
  const [dsConfig, setDsConfig] = useState<ConfiguredDataSource[]>([])
  // For custom workflow adding a single data source
  const [customDsType, setCustomDsType] = useState<DataSource['type'] | 'none'>('none')

  // AI Config step state
  const [systemPrompt, setSystemPrompt] = useState('')
  const [mcpServers,   setMcpServers]   = useState<McpServer[]>([])

  // Schedule step state
  const [wfName,   setWfName]   = useState('')
  const [trigger,  setTrigger]  = useState<TriggerChoice>('manual')
  const [hour,     setHour]     = useState('08:00')
  const [weekday,  setWeekday]  = useState('Monday')
  const [timezone, setTimezone] = useState('America/New_York')

  // Deploy state
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')
  const [createdId,     setCreatedId]     = useState<string | null>(null)
  const [webhookSecret] = useState(() => generateSecret())
  const [copiedUrl,     setCopiedUrl]     = useState(false)

  const filtered = category === 'all'
    ? WORKFLOW_TEMPLATES
    : WORKFLOW_TEMPLATES.filter(t => t.category === category)

  const showTimePicker = trigger === 'daily' || trigger === 'weekly' || trigger === 'monthly'

  // Pre-fill everything from template
  function selectTemplate(t: WorkflowTemplate) {
    setTemplate(t)
    setWfName(t.name)
    setSystemPrompt(t.system_prompt ?? '')
    setMcpServers((t.mcp_servers ?? []).map(s => ({ ...s, enabled: true })))

    // Extract existing data sources from the template's steps
    const sources: ConfiguredDataSource[] = []
    t.definition.steps.forEach(s => {
      s.data_sources?.forEach(ds => {
        sources.push({ ...ds, _step_id: s.step_id })
      })
    })
    setDsConfig(sources)
    setCustomDsType('none')

    const defaultTrigger = t.triggers[0]
    if (defaultTrigger === 'manual' || defaultTrigger === 'webhook') {
      setTrigger(defaultTrigger as TriggerChoice)
    } else if (defaultTrigger === 'cron') {
      setTrigger('daily')
    }

    setStep(1) // Move to Data Sources step
    window.scrollTo(0, 0)
  }

  function updateDsConfig(idx: number, updates: Partial<ConfiguredDataSource>) {
    setDsConfig(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item))
  }

  function toggleMcp(idx: number) {
    setMcpServers(prev => prev.map((s, i) => i === idx ? { ...s, enabled: !s.enabled } : s))
  }

  async function handleDeploy() {
    if (!template || !user) return
    setSaving(true); setError('')

    // 1. Reconcile data sources into steps
    const newSteps = JSON.parse(JSON.stringify(template.definition.steps)) // deep clone
    
    // Replace data source info inside the step array
    for (const stepConfig of newSteps) {
      const associatedDs = dsConfig.filter(ds => ds._step_id === stepConfig.step_id)
      if (associatedDs.length > 0) {
        stepConfig.data_sources = associatedDs.map(({ _step_id, ...ds }) => ds)
      }
    }

    // 2. Handle Custom Template Auto-Generation
    if (template.id === 'custom' && customDsType !== 'none') {
      const newDs: DataSource = { type: customDsType as DataSource['type'] }
      if (dsConfig[0]) {
        if (dsConfig[0].url) newDs.url = dsConfig[0].url
        if (dsConfig[0].bearer_token) newDs.bearer_token = dsConfig[0].bearer_token
        if (dsConfig[0].spreadsheet_id) newDs.spreadsheet_id = dsConfig[0].spreadsheet_id
      }
      
      newSteps.push({
        step_id: 'auto_ingest',
        agent_role: 'data_ingestor',
        depends_on: [],
        instructions: 'Ingest data from the configured source automatically.',
        data_sources: [newDs],
        input_sources: [],
        output_keys: ['ingested_data'],
        timeout_ms: 30000
      })
      newSteps.push({
        step_id: 'auto_analyst',
        agent_role: 'analyst',
        depends_on: ['auto_ingest'],
        instructions: 'Analyze the ingested data based on the user prompt.',
        input_sources: ['ingested_data'],
        output_keys: ['analysis_result'],
        timeout_ms: 60000
      })
    }

    const cronExpr = buildCron(trigger, hour, weekday)
    const definition = {
      ...template.definition,
      name: wfName || template.name,
      steps: newSteps,
      trigger: {
        type: trigger === 'webhook' ? 'webhook' : trigger === 'manual' ? 'manual' : 'cron',
        ...(cronExpr ? { cron_expression: cronExpr, timezone } : {}),
      },
      system_prompt: systemPrompt || undefined,
      mcp_servers: mcpServers.filter(s => s.enabled).length > 0
        ? mcpServers.filter(s => s.enabled)
        : undefined,
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

    setCreatedId(data.id)
    setSaving(false)
    setStep(4) // Move to deploy view
    window.scrollTo(0, 0)
  }

  if (authLoading) return <div className="flex justify-center pt-32"><Spinner className="text-black/20" /></div>

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Top Navbar */}
      <div className="h-14 border-b border-black/8 bg-white flex items-center px-6 sticky top-0 z-20">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium text-black/60 hover:text-black transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>

      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 pb-32">
        {step > 0 && <StepIndicator current={step} />}

        {/* ── STEP 0: Template Selection ── */}
        {step === 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-black">Create a New Workflow</h1>
              <p className="text-black/50 mt-1">Start from a template or build a custom agent swarm from scratch.</p>
            </div>

            <div className="flex gap-4 pb-4 border-b border-black/8 overflow-x-auto mb-8 scrollbar-hide">
              {TEMPLATE_CATEGORIES.map(cat => (
                <button key={cat.value} onClick={() => setCategory(cat.value)}
                  className={`text-[11px] tracking-[0.12em] uppercase font-semibold whitespace-nowrap px-4 py-2 rounded-full transition-colors ${
                    category === cat.value ? 'bg-black text-white' : 'bg-black/5 text-black/40 hover:bg-black/10'
                  }`}>
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((t) => (
                <div key={t.id} onClick={() => selectTemplate(t)}
                  className="bg-white border border-black/10 hover:border-black/30 hover:shadow-md rounded-xl p-5 cursor-pointer transition-all flex flex-col group h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 border border-black/10 rounded-lg flex items-center justify-center bg-black/[0.02] group-hover:bg-black text-black group-hover:text-white transition-colors">
                      <TemplateIcon name={t.icon} className="h-5 w-5" />
                    </div>
                    {t.id === 'custom' && (
                      <Badge variant="muted" className="text-[9px] uppercase tracking-wider text-black border-black/15">Start blank</Badge>
                    )}
                  </div>
                  <h3 className="font-bold text-black text-base">{t.name}</h3>
                  <p className="text-xs text-black/50 mt-1.5 leading-relaxed line-clamp-3 mb-4 flex-1">
                    {t.description}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-black/40 border-t border-black/5 pt-4">
                    <span className="font-semibold text-black/60">{CATEGORY_LABELS[t.category] ?? t.category}</span>
                    <span>·</span>
                    <span>{t.definition.steps.length} Agents</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 1: Data Sources ── */}
        {step === 1 && template && (
          <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-right-8 duration-500">
            <h2 className="text-xl font-bold text-black mb-1">Configure Data Sources</h2>
            <p className="text-sm text-black/50 mb-8">
              Connect external data to your agent graph. The agents will pull from these sources before running their analysis.
            </p>

            {template.id === 'custom' ? (
              <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm">
                <p className="block text-sm font-semibold text-black mb-3">Add a Data Source (Optional)</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  {[
                    { type: 'none', label: 'None', icon: Play },
                    { type: 'http', label: 'REST API', icon: Database },
                    { type: 'web_scrape', label: 'Web Scrape', icon: Globe },
                    { type: 'google_sheets', label: 'Google Sheets', icon: FileSpreadsheet },
                  ].map(opt => {
                    const active = customDsType === opt.type
                    const Icon = opt.icon
                    return (
                      <button key={opt.type} onClick={() => setCustomDsType(opt.type as any)}
                        className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all ${
                          active ? 'border-black bg-black text-white shadow-md' : 'border-black/10 hover:border-black/30 hover:bg-black/5'
                        }`}>
                        <Icon className={`h-5 w-5 mb-2 ${active ? 'text-white' : 'text-black/40'}`} />
                        <span className="text-[10px] uppercase tracking-wider font-semibold">{opt.label}</span>
                      </button>
                    )
                  })}
                </div>

                {customDsType !== 'none' && (
                  <div className="space-y-4 animate-in fade-in zoom-in-95 mt-6 border-t border-black/8 pt-6">
                    <p className="text-xs text-black/50 mb-4 bg-blue-500/10 text-blue-800 p-3 rounded border border-blue-500/20">
                      We will automatically generate a <strong className="font-mono">data_ingestor</strong> and an <strong className="font-mono">analyst</strong> agent step for you to parse this source.
                    </p>
                    {(customDsType === 'http' || customDsType === 'web_scrape') && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-1.5 block">
                            {customDsType === 'web_scrape' ? 'URL to Scrape' : 'API Endpoint URL'}
                          </label>
                          <input
                            type="url"
                            placeholder="https://api.example.com/v1/data"
                            className="w-full border border-black/15 rounded-md px-3 py-2 text-sm focus:border-black/40 outline-none font-mono"
                            value={dsConfig[0]?.url || ''}
                            onChange={e => {
                              if (dsConfig.length === 0) setDsConfig([{ type: customDsType as DataSource['type'], url: e.target.value }])
                              else updateDsConfig(0, { url: e.target.value })
                            }}
                          />
                        </div>
                        {customDsType === 'http' && (
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-1.5 block">
                              Bearer Token <span className="normal-case font-normal text-black/30">(optional)</span>
                            </label>
                            <input
                              type="password"
                              placeholder="sk_live_… or API key"
                              className="w-full border border-black/15 rounded-md px-3 py-2 text-sm focus:border-black/40 outline-none font-mono"
                              value={dsConfig[0]?.bearer_token || ''}
                              onChange={e => {
                                if (dsConfig.length === 0) setDsConfig([{ type: 'http', bearer_token: e.target.value }])
                                else updateDsConfig(0, { bearer_token: e.target.value })
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {customDsType === 'google_sheets' && (
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-1.5 block">Spreadsheet ID</label>
                        <input
                          type="text"
                          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                          className="w-full border border-black/15 font-mono rounded-md px-3 py-2 text-sm focus:border-black/40 outline-none bg-black/5"
                          value={dsConfig[0]?.spreadsheet_id || ''}
                          onChange={e => {
                            if (dsConfig.length === 0) setDsConfig([{ type: 'google_sheets', spreadsheet_id: e.target.value }])
                            else updateDsConfig(0, { spreadsheet_id: e.target.value })
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : dsConfig.length === 0 ? (
              <div className="bg-white border border-black/10 rounded-xl p-8 text-center text-black/50">
                <Database className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p>No external data sources required for this template.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dsConfig.map((ds, idx) => {
                  // Derive current UI mode from stored state or type
                  const uiMode: DsUiMode = ds._ui_mode ?? (ds.type === 'google_sheets' ? 'sheets' : 'api')

                  const switchMode = (mode: DsUiMode) => {
                    if (mode === 'sheets') updateDsConfig(idx, { _ui_mode: 'sheets', type: 'google_sheets', url: undefined, bearer_token: undefined })
                    else if (mode === 'csv') updateDsConfig(idx, { _ui_mode: 'csv', type: 'http', spreadsheet_id: undefined, bearer_token: undefined })
                    else updateDsConfig(idx, { _ui_mode: 'api', type: 'http', spreadsheet_id: undefined })
                  }

                  const modeBtns: { id: DsUiMode; label: string; icon: FC<LucideProps> }[] = [
                    { id: 'api',    label: 'REST API',      icon: Database },
                    { id: 'sheets', label: 'Google Sheets', icon: FileSpreadsheet },
                    { id: 'csv',    label: 'CSV Link',      icon: Globe },
                  ]

                  return (
                    <div key={idx} className="bg-white border border-black/10 rounded-xl p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <Badge variant="muted" className="bg-black/5 border-black/10 text-black/60 font-mono">
                          {ds._step_id}
                        </Badge>
                        <span className="text-sm font-semibold uppercase tracking-wider text-black">
                          {ds.label || ds.type.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* Source type switcher */}
                      <div className="grid grid-cols-3 gap-2 mb-5">
                        {modeBtns.map(btn => {
                          const active = uiMode === btn.id
                          const Icon = btn.icon
                          return (
                            <button key={btn.id} onClick={() => switchMode(btn.id)}
                              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                                active ? 'border-black bg-black text-white' : 'border-black/10 text-black/50 hover:border-black/30 hover:text-black'
                              }`}>
                              <Icon className="h-3.5 w-3.5" />
                              {btn.label}
                            </button>
                          )
                        })}
                      </div>

                      {/* REST API fields */}
                      {uiMode === 'api' && (
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-1.5 block">API Endpoint URL</label>
                            <input
                              type="url"
                              placeholder="https://api.example.com/v1/revenue"
                              className="w-full border border-black/15 rounded-md px-3 py-2 text-sm focus:border-black/40 outline-none font-mono"
                              value={ds.url || ''}
                              onChange={e => updateDsConfig(idx, { url: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-1.5 block">
                              API Key / Bearer Token <span className="normal-case font-normal text-black/30">(optional)</span>
                            </label>
                            <input
                              type="password"
                              placeholder="Leave blank if the endpoint is public"
                              className="w-full border border-black/15 rounded-md px-3 py-2 text-sm focus:border-black/40 outline-none font-mono"
                              value={ds.bearer_token || ''}
                              onChange={e => updateDsConfig(idx, { bearer_token: e.target.value })}
                            />
                            <p className="text-[10px] text-black/30 mt-1">Only needed if your API requires authentication.</p>
                          </div>
                        </div>
                      )}

                      {/* Google Sheets fields */}
                      {uiMode === 'sheets' && (
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-1.5 block">Google Sheet URL or ID</label>
                            <input
                              type="text"
                              placeholder="Paste the full Google Sheets link here"
                              className="w-full border border-black/15 rounded-md px-3 py-2 text-sm focus:border-black/40 outline-none"
                              value={ds.spreadsheet_id || ''}
                              onChange={e => updateDsConfig(idx, { spreadsheet_id: extractSheetId(e.target.value) })}
                            />
                            <p className="text-[10px] text-black/30 mt-1">Paste the full share link — we'll extract the ID automatically. Sheet must be shared with "Anyone with link".</p>
                          </div>
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-1.5 block">
                              Sheet / Tab Name <span className="normal-case font-normal text-black/30">(optional, defaults to Sheet1)</span>
                            </label>
                            <input
                              type="text"
                              placeholder="Sheet1"
                              className="w-full border border-black/15 rounded-md px-3 py-2 text-sm focus:border-black/40 outline-none font-mono"
                              value={ds.sheet_name || ''}
                              onChange={e => updateDsConfig(idx, { sheet_name: e.target.value })}
                            />
                          </div>
                        </div>
                      )}

                      {/* CSV Link fields */}
                      {uiMode === 'csv' && (
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-1.5 block">CSV File URL</label>
                          <input
                            type="url"
                            placeholder="https://example.com/data/revenue.csv"
                            className="w-full border border-black/15 rounded-md px-3 py-2 text-sm focus:border-black/40 outline-none font-mono"
                            value={ds.url || ''}
                            onChange={e => updateDsConfig(idx, { url: e.target.value })}
                          />
                          <p className="text-[10px] text-black/30 mt-1">Paste a direct link to any publicly accessible .csv file.</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex gap-4 mt-10">
              <button onClick={() => setStep(0)} className="px-6 py-2.5 rounded-lg border border-black/15 text-sm font-semibold text-black/60 hover:text-black hover:border-black/40 transition-colors">
                Back
              </button>
              <button onClick={() => setStep(2)} className="flex-1 flex justify-center items-center gap-2 px-6 py-2.5 rounded-lg bg-black text-white text-sm font-semibold shadow-md hover:bg-black/80 hover:shadow-lg transition-all">
                Continue to AI Config <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: AI Config ── */}
        {step === 2 && template && (
          <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-right-8 duration-500">
            <h2 className="text-xl font-bold text-black mb-1">AI Agent Configuration</h2>
            <p className="text-sm text-black/50 mb-8">
              Customize how the analyst agent behaves and the tools it has access to.
            </p>
            
            <div className="space-y-8">
              <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm">
                <label className="text-sm font-semibold text-black mb-1 block">System Prompt</label>
                <p className="text-xs text-black/40 mb-3 leading-relaxed">
                  Defines the agent's core identity. Adjust the tone, strictness, or output formats here.
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  rows={8}
                  className="w-full border border-black/15 rounded-lg px-4 py-3 text-sm text-black placeholder-black/30 focus:outline-none focus:border-black/40 focus:ring-2 focus:ring-black/5 bg-black/[0.02] resize-y font-mono leading-relaxed"
                />
                <p className="text-xs text-black/30 mt-2 text-right">{systemPrompt.length} chars</p>
              </div>

              <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm">
                <label className="text-sm font-semibold text-black mb-1 block">Model Context Protocol (MCP) Servers</label>
                <p className="text-xs text-black/40 mb-4 leading-relaxed">
                  External tool servers this agent can invoke directly.
                </p>
                
                {mcpServers.length === 0 ? (
                  <div className="border border-dashed border-black/15 rounded-lg p-6 text-center">
                    <Bot className="h-6 w-6 text-black/20 mx-auto mb-2" />
                    <p className="text-sm text-black/50">No additional tool servers required.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mcpServers.map((server, idx) => (
                      <div key={server.name}
                        className={`flex items-start gap-4 p-4 border rounded-lg transition-colors ${server.enabled ? 'border-black/20 bg-black/[0.02]' : 'border-black/8 opacity-50 bg-white'}`}>
                        <div className="w-8 h-8 rounded-full border border-black/12 flex items-center justify-center flex-shrink-0 bg-white">
                          <Bot className="h-4 w-4 text-black/60" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-black">{server.label}</span>
                            <Badge variant="muted" className="text-[9px] font-mono border-black/10 text-black/40 px-1.5 py-0.5">{server.name}</Badge>
                          </div>
                          <p className="text-xs text-black/50 mt-1">{server.description}</p>
                          <p className="text-[10px] text-black/30 font-mono mt-1.5 truncate">{server.url}</p>
                        </div>
                        <button
                          onClick={() => toggleMcp(idx)}
                          className="flex-shrink-0 p-1 hover:bg-black/5 rounded-full transition-colors"
                        >
                          {server.enabled
                            ? <ToggleRight className="h-6 w-6 text-green-600" />
                            : <ToggleLeft className="h-6 w-6 text-black/25" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button onClick={() => setStep(1)} className="px-6 py-2.5 rounded-lg border border-black/15 text-sm font-semibold text-black/60 hover:text-black hover:border-black/40 transition-colors">
                Back
              </button>
              <button onClick={() => setStep(3)} className="flex-1 flex justify-center items-center gap-2 px-6 py-2.5 rounded-lg bg-black text-white text-sm font-semibold shadow-md hover:bg-black/80 hover:shadow-lg transition-all">
                Continue to Scheduling <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Setup & Schedule ── */}
        {step === 3 && template && (
          <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-right-8 duration-500">
            <h2 className="text-xl font-bold text-black mb-1">Final Setup & Schedule</h2>
            <p className="text-sm text-black/50 mb-8">
              Name your workflow and decide how it gets triggered.
            </p>

            <div className="space-y-6">
              <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm">
                <label className="text-sm font-semibold text-black mb-2 block">Workflow Name</label>
                <input
                  value={wfName}
                  onChange={e => setWfName(e.target.value)}
                  placeholder={template.name}
                  className="w-full border border-black/15 rounded-lg px-4 py-2.5 text-sm text-black focus:border-black/40 focus:ring-2 focus:ring-black/5 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="bg-white border border-black/10 rounded-xl p-5 shadow-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-4 block">Trigger Event</h3>
                  <div className="space-y-2">
                    {TRIGGER_OPTIONS.map(opt => {
                      const Icon = opt.icon
                      const active = trigger === opt.value
                      return (
                        <button key={opt.value} onClick={() => setTrigger(opt.value)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                            active ? 'border-black bg-black text-white shadow-md' : 'border-black/10 hover:border-black/30 hover:bg-black/[0.02]'
                          }`}>
                          <Icon className={`h-4 w-4 flex-shrink-0 ${active ? 'text-white' : 'text-black/40'}`} />
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-bold ${active ? 'text-white' : 'text-black'}`}>{opt.label}</div>
                            <div className={`text-[10px] mt-0.5 ${active ? 'text-white/70' : 'text-black/40'}`}>{opt.desc}</div>
                          </div>
                          {active && <Check className="h-4 w-4 text-white flex-shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="bg-white border border-black/10 rounded-xl p-5 shadow-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-black/50 mb-4 block">Trigger Details</h3>
                  
                  {showTimePicker ? (
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-black mb-1.5 block">Time</label>
                        <select value={hour} onChange={e => setHour(e.target.value)}
                          className="w-full border border-black/15 rounded-md px-3 py-2 text-sm text-black focus:border-black/40 outline-none hover:bg-black/[0.02]">
                          {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      {trigger === 'weekly' && (
                        <div>
                          <label className="text-xs font-semibold text-black mb-1.5 block">Day of week</label>
                          <select value={weekday} onChange={e => setWeekday(e.target.value)}
                            className="w-full border border-black/15 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:border-black/40">
                            {WEEKDAYS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="text-xs font-semibold text-black mb-1.5 block">Timezone</label>
                        <select value={timezone} onChange={e => setTimezone(e.target.value)}
                          className="w-full border border-black/15 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:border-black/40">
                          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                      </div>
                      <div className="bg-black/5 border border-black/10 px-4 py-3 rounded-lg mt-2">
                        <p className="text-[10px] uppercase font-semibold tracking-wider text-black/40 mb-1">Generated Cron</p>
                        <p className="text-sm font-mono text-black font-bold">{buildCron(trigger, hour, weekday)}</p>
                      </div>
                    </div>
                  ) : trigger === 'webhook' ? (
                    <div className="space-y-3">
                      <Webhook className="h-8 w-8 text-black/20" />
                      <p className="text-sm text-black/60 leading-relaxed pt-2">
                        You'll get a unique endpoint URL and secret after deployment. POST external data to it to start the workflow.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Play className="h-8 w-8 text-black/20" />
                      <p className="text-sm text-black/60 leading-relaxed pt-2">
                        Run this workflow manually by hitting the "Run Now" button on the dashboard.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="flex gap-4 mt-10">
              <button onClick={() => setStep(2)} disabled={saving} className="px-6 py-2.5 rounded-lg border border-black/15 text-sm font-semibold text-black/60 hover:text-black hover:border-black/40 transition-colors disabled:opacity-50">
                Back
              </button>
              <button onClick={handleDeploy} disabled={saving} className="flex-1 flex justify-center items-center gap-2 px-6 py-2.5 rounded-lg bg-black text-white text-sm font-semibold shadow-md hover:bg-black/80 hover:shadow-lg transition-all disabled:opacity-50">
                {saving ? <><Spinner size="sm" className="text-white" /> Deploying...</> : <><Zap className="h-4 w-4" /> Save & Deploy</>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Success / Post-Deploy ── */}
        {step === 4 && createdId && (
          <div className="max-w-xl mx-auto text-center animate-in zoom-in-95 duration-700">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-500/20">
              <Check className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-black mb-3 tracking-tight">Workflow Deployed!</h2>
            <p className="text-black/60 text-lg mb-10">Your agent swarm is ready to work.</p>

            {trigger === 'webhook' && (
              <div className="bg-white border text-left border-black/10 rounded-xl p-6 shadow-xl mb-10 overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" />
                <h3 className="font-bold text-black mb-4">Webhook Credentials</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs uppercase font-semibold tracking-wider text-black/40 mb-1.5 block">POST URL</label>
                    <div className="bg-black/5 p-3 rounded-lg border border-black/10 font-mono text-xs text-black break-all">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/{createdId}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs uppercase font-semibold tracking-wider text-black/40 mb-1.5 block">Secret (X-Webhook-Secret Header)</label>
                    <div className="bg-black/5 p-3 rounded-lg border border-black/10 flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-black break-all">{webhookSecret}</span>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(webhookSecret)
                          setCopiedUrl(true)
                          setTimeout(() => setCopiedUrl(false), 2000)
                        }}
                        className="px-3 py-1.5 bg-white border border-black/15 hover:bg-black/5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
                      >
                        {copiedUrl ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                        {copiedUrl ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[10px] text-black/40 mt-2">Save this secret now. It won't be shown again.</p>
                  </div>
                </div>
              </div>
            )}

            <Link href={`/workflows/${createdId}`} className="block w-full py-3.5 rounded-lg bg-black text-white font-bold shadow-lg shadow-black/20 hover:bg-black/80 hover:shadow-xl transition-all">
              Go to Workflow Dashboard
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}
