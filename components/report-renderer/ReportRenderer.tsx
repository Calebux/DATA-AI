'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Download, FileText, Maximize2, X } from 'lucide-react'
import type { EvalResult } from '@/types'

// ─── constants ────────────────────────────────────────────────────────────────

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#dc2626', '#65a30d']

const META_KEYS = new Set([
  'eval_result', 'generated_at', 'id', 'note', 'flag',
  'methodology', 'rationale', 'context', 'cohort_label', 'assumptions',
])

// ─── helpers ──────────────────────────────────────────────────────────────────

function tryParseJson(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const t = v.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return v
  try { return JSON.parse(t) } catch { return v }
}

function isNum(v: unknown): v is number { return typeof v === 'number' && isFinite(v) }

function fmtKey(k: string) {
  return k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase())
}

function fmtVal(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return String(v)
}

const tooltipFmt = (v: unknown) =>
  typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? '')

function detectTimeKey(keys: string[]) {
  return keys.find(k => /^(month|period|date|quarter|week|year|time)$/i.test(k))
}

function partitionObj(obj: Record<string, unknown>) {
  const subObjs: [string, Record<string, unknown>][] = []
  const primitives: [string, unknown][] = []
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'object' && v !== null && !Array.isArray(v))
      subObjs.push([k, v as Record<string, unknown>])
    else
      primitives.push([k, v])
  }
  return { subObjs, primitives }
}

function objOfObjsToRows(obj: Record<string, Record<string, unknown>>, catKey = '_cat') {
  return Object.entries(obj).map(([k, v]) => ({ [catKey]: k, ...v }))
}

function pickPieKey(sample: Record<string, unknown>): string | null {
  const numKeys = Object.keys(sample).filter(k => isNum(sample[k]))
  const pctKey = numKeys.find(k => /pct|share|percent/i.test(k))
  return pctKey ?? (numKeys.length ? numKeys[0] : null)
}

// ─── chart components ─────────────────────────────────────────────────────────

function LineChartViz({ rows }: { rows: Record<string, unknown>[] }) {
  const keys = Object.keys(rows[0])
  const tk = detectTimeKey(keys)!
  const numKeys = keys.filter(k => k !== tk && isNum(rows[0][k]) && !META_KEYS.has(k)).slice(0, 6)
  return (
    <div className="w-full h-56 mt-3 mb-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={tk} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={52} tickFormatter={(v: number) => v.toLocaleString()} />
          <Tooltip formatter={tooltipFmt} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {numKeys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} name={fmtKey(k)}
              stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function BarChartViz({ rows, catKey }: { rows: Record<string, unknown>[]; catKey: string }) {
  const numKeys = Object.keys(rows[0])
    .filter(k => k !== catKey && isNum(rows[0][k]) && !META_KEYS.has(k))
    .slice(0, 4)
  return (
    <div className="w-full h-52 mt-3 mb-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={catKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={52} tickFormatter={(v: number) => v.toLocaleString()} />
          <Tooltip formatter={tooltipFmt} />
          {numKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {numKeys.map((k, i) => (
            <Bar key={k} dataKey={k} name={fmtKey(k)}
              fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function PieChartViz({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="w-full h-56 mt-3 mb-1">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name"
            cx="50%" cy="50%" outerRadius={90} innerRadius={40}
            paddingAngle={2}
            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
            labelLine={false}
          >
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={tooltipFmt} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── table ────────────────────────────────────────────────────────────────────

function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = Object.keys(rows[0]).filter(k => !META_KEYS.has(k)).slice(0, 10)
  return (
    <div className="overflow-x-auto rounded-lg border border-black/8 mt-2">
      <table className="w-full text-xs">
        <thead className="bg-black/[0.03] border-b border-black/8">
          <tr>
            {cols.map(c => (
              <th key={c} className="px-3 py-2 text-left font-semibold text-black/45 uppercase tracking-wide whitespace-nowrap">
                {fmtKey(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? '' : 'bg-black/[0.015]'}>
              {cols.map(c => (
                <td key={c} className={`px-3 py-1.5 whitespace-nowrap ${isNum(row[c]) ? 'text-black font-medium tabular-nums' : 'text-black/60'}`}>
                  {fmtVal(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── stat cards ───────────────────────────────────────────────────────────────

function StatGrid({ obj }: { obj: Record<string, unknown> }) {
  const entries = Object.entries(obj).filter(([, v]) => v != null)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-2">
      {entries.map(([k, v]) => (
        <div key={k} className="border border-black/8 rounded-xl p-3 bg-black/[0.01]">
          <p className="text-[10px] text-black/40 font-semibold uppercase tracking-wide mb-1 leading-tight">{fmtKey(k)}</p>
          <p className={`font-bold leading-tight ${isNum(v) ? 'text-xl text-black tabular-nums' : 'text-sm text-black/80'}`}>
            {fmtVal(v)}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── anomaly cards ────────────────────────────────────────────────────────────

function severityStyle(s: string) {
  if (s === 'HIGH') return 'bg-red-50 border-red-200'
  if (s === 'MEDIUM') return 'bg-amber-50 border-amber-200'
  return 'bg-sky-50 border-sky-200'
}
function severityBadge(s: string) {
  if (s === 'HIGH') return 'bg-red-100 text-red-700 border-red-200'
  if (s === 'MEDIUM') return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-sky-100 text-sky-700 border-sky-200'
}

function AnomalyCard({ item }: { item: Record<string, unknown> }) {
  const sev = String(item.severity ?? 'LOW')
  return (
    <div className={`rounded-xl border p-4 ${severityStyle(sev)}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-xs font-bold">{String(item.metric ?? item.id ?? '')}</span>
          {item.month != null && <span className="ml-2 text-xs opacity-60">{String(item.month)}</span>}
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide border rounded-full px-2 py-0.5 shrink-0 ${severityBadge(sev)}`}>
          {sev}
        </span>
      </div>
      {item.context != null && <p className="text-xs leading-relaxed text-black/70">{String(item.context)}</p>}
    </div>
  )
}

// ─── recursive renderer ───────────────────────────────────────────────────────

function RenderValue({ label, value, depth = 0 }: {
  label?: string
  value: unknown
  depth?: number
}) {
  const parsed = tryParseJson(value)

  if (parsed == null) return null

  const labelEl = label
    ? <p className="text-[10px] font-bold text-black/35 uppercase tracking-widest mb-2">{fmtKey(label)}</p>
    : null

  if (typeof parsed === 'string') {
    return <div>{labelEl}<p className="text-sm text-black/70 leading-relaxed">{parsed}</p></div>
  }

  if (typeof parsed === 'number' || typeof parsed === 'boolean') {
    return (
      <div>
        {label && <p className="text-[10px] text-black/40 font-semibold uppercase tracking-wide mb-0.5">{fmtKey(label)}</p>}
        <p className="text-lg font-bold text-black tabular-nums">{fmtVal(parsed)}</p>
      </div>
    )
  }

  if (Array.isArray(parsed)) {
    if (!parsed.length) return null

    if (parsed.every(item => typeof item !== 'object' || item === null)) {
      return (
        <div>
          {labelEl}
          <ul className="list-disc list-inside space-y-0.5">
            {(parsed as string[]).map((item, i) => (
              <li key={i} className="text-sm text-black/70">{String(item)}</li>
            ))}
          </ul>
        </div>
      )
    }

    const rows = parsed as Record<string, unknown>[]

    if (rows[0]?.severity !== undefined) {
      return (
        <div>
          {labelEl}
          <div className="space-y-2">{rows.map((item, i) => <AnomalyCard key={i} item={item} />)}</div>
        </div>
      )
    }

    const keys = Object.keys(rows[0])
    const tk = detectTimeKey(keys)
    const numKeys = keys.filter(k => k !== tk && isNum(rows[0][k]))

    if (tk && numKeys.length) {
      return (
        <div>
          {labelEl}
          <LineChartViz rows={rows} />
          <DataTable rows={rows} />
        </div>
      )
    }

    const catKey = keys.find(k => typeof rows[0][k] === 'string' && !META_KEYS.has(k))
    if (catKey && numKeys.length && rows.length <= 20) {
      return (
        <div>
          {labelEl}
          <BarChartViz rows={rows} catKey={catKey} />
          <DataTable rows={rows} />
        </div>
      )
    }

    return <div>{labelEl}<DataTable rows={rows} /></div>
  }

  const obj = parsed as Record<string, unknown>
  const entries = Object.entries(obj).filter(([, v]) => v != null)
  if (!entries.length) return null

  const allPrimitive = entries.every(([, v]) => typeof v !== 'object' || v === null)

  if (allPrimitive) {
    const numEntries = entries.filter(([, v]) => isNum(v))
    const total = numEntries.reduce((s, [, v]) => s + (v as number), 0)
    const isPct = numEntries.length >= 2 && numEntries.length <= 10 && Math.abs(total - 100) < 2

    if (isPct) {
      const pieData = numEntries.map(([k, v]) => ({ name: fmtKey(k), value: v as number }))
      return <div>{labelEl}<PieChartViz data={pieData} /></div>
    }

    if (numEntries.length >= 2 && numEntries.length <= 10 && entries.every(([, v]) => isNum(v))) {
      const barRows = numEntries.map(([k, v]) => ({ _cat: fmtKey(k), value: v as number }))
      return <div>{labelEl}<BarChartViz rows={barRows} catKey="_cat" /></div>
    }

    const hasNums = numEntries.length > 0
    return (
      <div>
        {labelEl}
        {hasNums ? (
          <StatGrid obj={obj} />
        ) : (
          <div className="space-y-1 mt-1">
            {entries.map(([k, v]) => (
              <div key={k} className="flex gap-2 text-sm">
                <span className="text-black/40 shrink-0 font-medium min-w-32">{fmtKey(k)}</span>
                <span className="text-black/70">{fmtVal(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const { subObjs, primitives } = partitionObj(obj)
  const isObjOfObjs = subObjs.length >= 2 && subObjs.length <= 10
    && subObjs.every(([, v]) => Object.values(v).some(isNum))

  if (isObjOfObjs) {
    const rows = objOfObjsToRows(Object.fromEntries(subObjs))
    const pctKey = pickPieKey(subObjs[0][1])
    const isPct = pctKey && /pct|share|percent/i.test(pctKey)
      && (() => {
        const total = subObjs.reduce((s, [, v]) => s + (isNum(v[pctKey!]) ? (v[pctKey!] as number) : 0), 0)
        return Math.abs(total - 100) < 5
      })()

    return (
      <div className="space-y-3">
        {labelEl}
        {isPct ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PieChartViz data={subObjs.map(([k, v]) => ({ name: fmtKey(k), value: (v[pctKey!] as number) ?? 0 }))} />
            <BarChartViz rows={rows} catKey="_cat" />
          </div>
        ) : (
          <BarChartViz rows={rows} catKey="_cat" />
        )}
        <DataTable rows={rows} />
        {primitives.length > 0 && (
          <StatGrid obj={Object.fromEntries(primitives.filter(([, v]) => isNum(v)))} />
        )}
      </div>
    )
  }

  if (depth === 0) {
    return (
      <div className="space-y-4">
        {entries.filter(([k]) => !META_KEYS.has(k)).map(([k, v]) => (
          <div key={k} className="border border-black/8 rounded-xl p-4">
            <p className="text-[10px] font-bold text-black/35 uppercase tracking-widest mb-3">{fmtKey(k)}</p>
            <RenderValue value={v} depth={1} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {labelEl}
      {entries.filter(([k]) => !META_KEYS.has(k)).map(([k, v]) => (
        <RenderValue key={k} label={k} value={v} depth={depth + 1} />
      ))}
    </div>
  )
}

// ─── main export ──────────────────────────────────────────────────────────────

interface ReportRendererProps {
  report: Record<string, unknown>
  title?: string
  onExportPdf?: () => void
  onExportXlsx?: () => void
}

export default function ReportRenderer({ report, title, onExportXlsx }: ReportRendererProps) {
  const [fullscreen, setFullscreen] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const evalResult = report.eval_result as EvalResult | undefined
  const score = evalResult?.overall_score != null
    ? `${(evalResult.overall_score * 10).toFixed(1)}/10`
    : null

  const sections = useMemo(
    () => Object.entries(report).filter(([k]) => !['eval_result', 'generated_at'].includes(k)),
    [report],
  )

  // Close fullscreen on Escape
  useEffect(() => {
    if (!fullscreen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [fullscreen])

  function handlePdf() {
    const el = printRef.current
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html>
<head>
  <meta charset="utf-8">
  <title>${title ?? 'Report'}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:48px;max-width:960px;margin:0 auto;color:#1d1d1f;background:white;font-size:14px;line-height:1.6}
    h2{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#999;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin:32px 0 16px}
    p{margin-bottom:8px;color:#3c3c43}
    ul{padding-left:20px}li{margin-bottom:4px;color:#3c3c43}
    table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0}
    th{text-align:left;padding:8px 12px;background:#f5f5f7;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#666;border-bottom:2px solid #e5e7eb}
    td{padding:7px 12px;border-bottom:1px solid #f0f0f0}
    tr:nth-child(even) td{background:#fafafa}
    svg{max-width:100%}
    @media print{body{padding:24px}@page{margin:1.5cm}}
  </style>
</head>
<body>
  ${title ? `<h1 style="font-size:22px;font-weight:700;margin-bottom:${score ? '4px' : '32px'}">${title}</h1>` : ''}
  ${score ? `<p style="font-size:12px;color:#999;margin-bottom:32px">Quality score: <strong style="color:#16a34a">${score}</strong></p>` : ''}
  ${el.innerHTML}
</body>
</html>`)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  if (sections.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-black/30">Report is empty</p>
      </div>
    )
  }

  const reportBody = (
    <>
      {sections.map(([key, value]) => (
        <div key={key}>
          <h2 className="text-[11px] font-bold text-black/35 uppercase tracking-widest border-b border-black/8 pb-2 mb-4">
            {fmtKey(key)}
          </h2>
          <RenderValue value={value} depth={0} />
        </div>
      ))}

      {evalResult?.scores && (
        <div className="border border-black/8 rounded-xl p-4 bg-black/[0.01]">
          <p className="text-[10px] font-bold text-black/35 uppercase tracking-widest mb-3">Quality Scores</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(evalResult.scores).map(([k, val]) => (
              <div key={k} className="text-center">
                <p className="text-2xl font-bold text-black tabular-nums">{(val * 10).toFixed(1)}</p>
                <p className="text-xs text-black/40 capitalize mt-0.5">{k}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )

  const toolbar = (inFullscreen: boolean) => (
    <div className="flex items-center justify-between gap-3">
      <div>
        {title && <p className="text-sm font-medium text-black">{title}</p>}
        {score && (
          <p className="text-xs text-black/40 mt-0.5">
            Quality: <span className="text-emerald-600 font-medium">{score}</span>
          </p>
        )}
      </div>
      <div className="flex gap-2">
        {onExportXlsx && (
          <Button variant="outline" size="sm" onClick={onExportXlsx}>
            <FileText className="h-4 w-4 mr-1" /> XLSX
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handlePdf}>
          <Download className="h-4 w-4 mr-1" /> PDF
        </Button>
        {inFullscreen ? (
          <Button variant="outline" size="sm" onClick={() => setFullscreen(false)}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setFullscreen(true)} title="Full screen">
            <Maximize2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* ── Fullscreen overlay ──────────────────────────────────────────────── */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex-none border-b border-black/8 px-6 py-3 bg-white/95 backdrop-blur">
            {toolbar(true)}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
              {reportBody}
            </div>
          </div>
        </div>
      )}

      {/* ── Normal view ─────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {toolbar(false)}
        <div ref={printRef} className="space-y-6">
          {reportBody}
        </div>
      </div>
    </>
  )
}
