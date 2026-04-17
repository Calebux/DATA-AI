'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Play, Settings, Clock } from 'lucide-react'
import type { Workflow, WorkflowRun } from '@/types'
import { formatRelative } from '@/lib/utils'

const STATUS_BADGE = { active: 'green', paused: 'yellow', draft: 'muted' } as const
const RUN_BADGE = { running: 'default', complete: 'green', failed: 'red' } as const

const CATEGORY_LABELS: Record<string, string> = {
  finance_executive: 'Finance',
  customer_success: 'CS',
  sales: 'Sales',
  marketing: 'Marketing',
  product: 'Product',
  custom: 'Custom',
}

interface WorkflowCardProps {
  workflow: Workflow
  lastRun?: WorkflowRun
  onRun?: () => void
}

export default function WorkflowCard({ workflow, lastRun, onRun }: WorkflowCardProps) {
  return (
    <Card className="flex flex-col gap-4 hover:border-white/12 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-white truncate">{workflow.name}</h3>
            <Badge variant={STATUS_BADGE[workflow.status]}>{workflow.status}</Badge>
          </div>
          <p className="text-xs text-white/40 mt-0.5">{CATEGORY_LABELS[workflow.category] ?? workflow.category}</p>
        </div>
      </div>

      {workflow.description && (
        <p className="text-sm text-white/50 leading-relaxed line-clamp-2">{workflow.description}</p>
      )}

      <div className="flex items-center gap-2 text-xs text-white/30">
        <Clock className="h-3.5 w-3.5" />
        {lastRun ? (
          <span>
            Last run {formatRelative(lastRun.triggered_at)} — {' '}
            <Badge variant={RUN_BADGE[lastRun.status]} className="text-[10px] py-0">{lastRun.status}</Badge>
          </span>
        ) : (
          <span>Never run</span>
        )}
      </div>

      <div className="flex gap-2 mt-auto">
        <Button variant="ghost" size="sm" asChild className="flex-1">
          <Link href={`/workflows/${workflow.id}`}>
            <Settings className="h-4 w-4" /> Manage
          </Link>
        </Button>
        <Button size="sm" onClick={onRun} className="flex-1">
          <Play className="h-4 w-4" /> Run Now
        </Button>
      </div>
    </Card>
  )
}
