'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import type { Report } from '@/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import ReportRenderer from '@/components/report-renderer/ReportRenderer'
import { formatDate } from '@/lib/utils'
import { FileText } from 'lucide-react'

export default function ReportsPage() {
  const { user } = useAuth()
  const [reports, setReports] = useState<Report[]>([])
  const [selected, setSelected] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const supabase = getSupabase()

    supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setReports(data as Report[])
        setLoading(false)
      })
  }, [user])

  if (loading) return <div className="flex justify-center pt-20"><Spinner size="lg" className="text-[rgb(var(--brand))]" /></div>

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Reports</h1>
        <p className="text-sm text-white/40 mt-1">{reports.length} report{reports.length !== 1 ? 's' : ''} generated</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="space-y-2">
          {reports.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-10">No reports yet. Run a workflow to generate one.</p>
          ) : (
            reports.map(report => (
              <button
                key={report.id}
                onClick={() => setSelected(report)}
                className={`w-full text-left rounded-xl p-3 border transition-colors ${selected?.id === report.id ? 'border-[rgb(var(--brand))]/40 bg-[rgb(var(--brand))]/8' : 'border-white/6 bg-[rgb(var(--surface))] hover:border-white/10'}`}
              >
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-white/30 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{report.title}</p>
                    <p className="text-xs text-white/30 mt-0.5">{formatDate(report.created_at)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Viewer */}
        <div className="lg:col-span-2">
          {selected ? (
            <ReportRenderer
              report={selected.content}
              title={selected.title}
            />
          ) : (
            <Card className="flex items-center justify-center h-64">
              <p className="text-white/30 text-sm">Select a report to view</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
