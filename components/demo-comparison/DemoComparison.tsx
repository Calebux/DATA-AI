'use client'

import { useState } from 'react'
import { ChevronDown, User, Zap } from 'lucide-react'

const MANUAL_STEPS = [
  { tool: 'Stripe Dashboard', action: 'Pull MRR + churn data', time: '8 min' },
  { tool: 'HubSpot', action: 'Export at-risk accounts', time: '12 min' },
  { tool: 'Spreadsheet', action: 'Cross-reference & score risk', time: '15 min' },
  { tool: 'ChatGPT', action: 'Draft CEO summary', time: '5 min' },
  { tool: 'Email client', action: 'Format & send report', time: '5 min' },
]

const SWARM_STEPS = [
  { agent: 'Data Ingestor ×2', action: 'Stripe + HubSpot in parallel', time: '~18s' },
  { agent: 'Analyst ×3', action: 'Churn scoring via consensus', time: '~35s' },
  { agent: 'Evaluator', action: 'Quality gate — auto-retry if fail', time: '~12s' },
  { agent: 'Delivery', action: 'HTML email sent', time: '~5s' },
]

export default function DemoComparison() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-white/6 bg-[rgb(var(--surface))] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-white/3 transition-colors text-left"
      >
        <ChevronDown className={`h-3.5 w-3.5 text-white/30 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="text-xs font-medium text-white/60 uppercase tracking-widest">Manual vs Swarm</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-white/5 space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="rounded-lg bg-white/4 border border-white/8 px-3 py-3 text-center">
              <User className="h-4 w-4 text-white/25 mx-auto mb-1.5" />
              <div className="text-lg font-bold text-white">45 min</div>
              <div className="text-[10px] text-white/35 uppercase tracking-widest mt-0.5">Manual</div>
              <div className="text-[10px] text-white/25 mt-1">1 person · 5 tools</div>
            </div>
            <div className="rounded-lg bg-[rgb(var(--brand))]/8 border border-[rgb(var(--brand))]/20 px-3 py-3 text-center">
              <Zap className="h-4 w-4 text-[rgb(var(--brand))] mx-auto mb-1.5" />
              <div className="text-lg font-bold text-[rgb(var(--brand))]">~70s</div>
              <div className="text-[10px] text-[rgb(var(--brand))]/70 uppercase tracking-widest mt-0.5">Swarm</div>
              <div className="text-[10px] text-white/25 mt-1">0 people · 6 agents</div>
            </div>
          </div>

          {/* Manual steps */}
          <div>
            <p className="text-[10px] text-white/25 uppercase tracking-widest mb-2">Manual workflow</p>
            <div className="space-y-1.5">
              {MANUAL_STEPS.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-white/20 w-4 text-right flex-shrink-0">{i + 1}</span>
                  <span className="text-white/50 flex-1">{s.tool}</span>
                  <span className="text-white/30 truncate hidden sm:block">{s.action}</span>
                  <span className="text-white/25 tabular-nums flex-shrink-0 text-right w-10">{s.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Swarm steps */}
          <div>
            <p className="text-[10px] text-white/25 uppercase tracking-widest mb-2">Swarm execution</p>
            <div className="space-y-1.5">
              {SWARM_STEPS.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-white/20 w-4 text-right flex-shrink-0">{i + 1}</span>
                  <span className="text-white/60 flex-1">{s.agent}</span>
                  <span className="text-white/30 truncate hidden sm:block">{s.action}</span>
                  <span className="text-[rgb(var(--brand))]/70 tabular-nums flex-shrink-0 text-right w-10">{s.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-[rgb(var(--brand))]/6 border border-[rgb(var(--brand))]/15 px-3 py-2">
            <p className="text-[11px] text-[rgb(var(--brand))]/80 text-center">
              <strong>38× faster</strong> · zero human time · fully auditable
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
