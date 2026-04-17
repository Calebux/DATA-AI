'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { WORKFLOW_TEMPLATES, TEMPLATE_CATEGORIES } from '@/data/workflows'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import type { WorkflowTemplate } from '@/types'
import Link from 'next/link'
import {
  TrendingUp, DollarSign, AlertCircle, Search, Target,
  Server, Wand2, type LucideProps,
} from 'lucide-react'
import type { FC } from 'react'

const TEMPLATE_ICON_MAP: Record<string, FC<LucideProps>> = {
  TrendingUp, DollarSign, AlertCircle, Search, Target, Server, Wand2,
}

function TemplateIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TEMPLATE_ICON_MAP[name] ?? Wand2
  return <Icon className={className} />
}

const CATEGORY_LABELS: Record<string, string> = {
  finance_executive: 'FINANCE',
  customer_success:  'CUST. SUCCESS',
  sales:             'SALES',
  marketing:         'MARKETING',
  product:           'PRODUCT',
  operations:        'OPERATIONS',
  hr:                'HR',
  custom:            'CUSTOM',
}

export default function NewWorkflowPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [activeCategory, setActiveCategory] = useState('all')
  const [selected, setSelected] = useState<WorkflowTemplate | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filtered = activeCategory === 'all'
    ? WORKFLOW_TEMPLATES
    : WORKFLOW_TEMPLATES.filter(t => t.category === activeCategory)

  async function handleCreate() {
    if (!selected || !user) return
    setSaving(true)
    setError('')
    const supabase = getSupabase()
    const { data, error: err } = await supabase
      .from('workflows')
      .insert({
        user_id: user.id,
        name: name || selected.name,
        category: selected.category,
        description: description || selected.description,
        status: 'active',
        definition: { ...selected.definition, name: name || selected.name },
      })
      .select().single()
    if (err) { setError(err.message); setSaving(false); return }
    router.push(`/workflows/${data.id}`)
  }

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 pb-24">

      {/* Header */}
      <div className="flex items-end justify-between mb-8 pb-4 rule">
        <div>
          <p className="section-label mb-1.5">
            <Link href="/dashboard" className="hover:text-black/60 transition-colors">Workflows</Link>
            {' / '}New
          </p>
          <h1 className="text-xl font-bold tracking-tight text-black">Select Template</h1>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-6 mb-0 pb-3 rule overflow-x-auto">
        {TEMPLATE_CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value)}
            className={`text-[10px] tracking-[0.13em] uppercase font-semibold flex-shrink-0 transition-colors ${
              activeCategory === cat.value ? 'text-black' : 'text-black/30 hover:text-black/60'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template rows */}
      <div className="mb-12">
        {filtered.map((t, i) => {
          const isSel = selected?.id === t.id
          return (
            <div
              key={t.id}
              onClick={() => { setSelected(t); setName(t.name); setDescription(t.description) }}
              className={`flex items-center gap-4 py-3.5 rule cursor-pointer group transition-colors ${isSel ? 'row-inverted' : 'hover:bg-black/3'}`}
            >
              <span className="row-num">{String(i + 1).padStart(2, '0')}.</span>
              <TemplateIcon name={t.icon} className={`h-4 w-4 flex-shrink-0 ${isSel ? 'text-white/70' : 'text-black/40'}`} />

              <div className="flex-1 min-w-0 flex items-baseline gap-2">
                <span className={`text-[13px] font-semibold tracking-tight flex-shrink-0 ${isSel ? 'text-white' : 'text-black'}`}>
                  {t.name}
                </span>
                {t.description && (
                  <>
                    <span className={`text-xs flex-shrink-0 ${isSel ? 'text-white/30' : 'text-black/20'}`}>—</span>
                    <span className={`text-xs truncate ${isSel ? 'text-white/55' : 'text-black/40'}`}>
                      {t.description}
                    </span>
                  </>
                )}
              </div>

              <span className={`hidden sm:block text-[10px] flex-shrink-0 ${isSel ? 'text-white/40' : 'text-black/25'}`}>
                {t.definition.steps.length} agents
              </span>

              <span className={`text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 border flex-shrink-0 ${isSel ? 'border-white/20 text-white/60' : 'border-black/15 text-black/40'}`}>
                {CATEGORY_LABELS[t.category] ?? t.category.toUpperCase()}
              </span>
            </div>
          )
        })}
      </div>

      {/* Config panel */}
      {selected && (
        <div className="border border-black/12 p-6 space-y-5">
          <p className="section-label">Configure — {selected.name}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="section-label block mb-2">Workflow Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={selected.name}
                className="w-full bg-transparent border border-black/15 px-3 py-2 text-sm text-black placeholder-black/30 focus:outline-none focus:border-black/40"
              />
            </div>
            <div>
              <label className="section-label block mb-2">Description</label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={selected.description}
                className="w-full bg-transparent border border-black/15 px-3 py-2 text-sm text-black placeholder-black/30 focus:outline-none focus:border-black/40"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end pt-1">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-black text-white text-[10px] tracking-[0.14em] uppercase font-semibold hover:bg-black/80 transition-colors disabled:opacity-50"
            >
              {saving && <Spinner size="sm" className="text-white/60" />}
              Create Workflow
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
