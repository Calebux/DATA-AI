'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, FileText } from 'lucide-react'
import type { EvalResult } from '@/types'

interface ReportSection {
  title: string
  content: string
  type?: 'text' | 'list' | 'table'
}

interface ReportData {
  headline?: string
  sections?: ReportSection[]
  raw?: Record<string, string>
  eval_result?: EvalResult
  generated_at?: string
}

interface ReportRendererProps {
  report: ReportData | Record<string, unknown>
  title?: string
  onExportPdf?: () => void
  onExportXlsx?: () => void
}

export default function ReportRenderer({ report, title, onExportPdf, onExportXlsx }: ReportRendererProps) {
  // Normalise — accept either structured or raw key/value report
  const data = report as ReportData
  const evalResult = data.eval_result as EvalResult | undefined
  const score = evalResult?.overall_score != null
    ? `${(evalResult.overall_score * 10).toFixed(1)}/10`
    : null

  // Build sections from raw object if no structured sections
  const sections: ReportSection[] = data.sections ?? Object.entries(data.raw ?? (report as Record<string, string>))
    .filter(([k]) => !['eval_result', 'generated_at', 'headline'].includes(k))
    .map(([k, v]) => ({ title: k.replace(/_/g, ' ').toUpperCase(), content: String(v) }))

  const headline = data.headline ?? (report as Record<string, string>)['headline'] ?? (report as Record<string, string>)['HEADLINE']

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div>
          {title && <p className="text-sm font-medium text-white">{title}</p>}
          {score && (
            <p className="text-xs text-white/40 mt-0.5">
              Report quality: <span className="text-[rgb(var(--green))]">{score}</span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {onExportXlsx && (
            <Button variant="outline" size="sm" onClick={onExportXlsx}>
              <FileText className="h-4 w-4" /> XLSX
            </Button>
          )}
          {onExportPdf && (
            <Button variant="outline" size="sm" onClick={onExportPdf}>
              <Download className="h-4 w-4" /> PDF
            </Button>
          )}
        </div>
      </div>

      {/* Headline */}
      {headline && (
        <Card className="border-l-4 border-l-[rgb(var(--brand))] bg-[rgb(var(--brand))]/5">
          <p className="text-xs font-bold text-[rgb(var(--brand))] uppercase tracking-widest mb-1">Headline</p>
          <p className="text-white font-medium leading-relaxed">{headline}</p>
        </Card>
      )}

      {/* Sections */}
      {sections.map((section, i) => (
        <Card key={i}>
          <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2">{section.title}</p>
          <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
            {section.content}
          </div>
        </Card>
      ))}

      {/* Eval scores */}
      {evalResult?.scores && (
        <Card className="bg-white/3">
          <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">Quality Scores</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(evalResult.scores).map(([key, val]) => (
              <div key={key} className="text-center">
                <p className="text-lg font-bold text-white">{(val * 10).toFixed(1)}</p>
                <p className="text-xs text-white/40 capitalize">{key}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
