'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'Workflows' },
  { href: '/runs',       label: 'Runs' },
  { href: '/inbox',      label: 'Inbox' },
  { href: '/knowledge',  label: 'Knowledge Base' },
  { href: '/analytics',  label: 'Analytics' },
]

const HIDDEN_ON = ['/', '/auth']

export default function SubNav() {
  const { user } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  if (!user) return null
  if (HIDDEN_ON.some(p => pathname === p || pathname?.startsWith('/auth'))) return null

  return (
    <div className="bg-white border-b border-black/8 sticky top-14 z-30">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 h-11 flex items-center justify-between">
        <nav className="flex items-center gap-0.5">
          {NAV_ITEMS.map(item => {
            const active = pathname?.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  active
                    ? 'text-black bg-black/6'
                    : 'text-black/45 hover:text-black hover:bg-black/4'
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <button
          onClick={() => router.push('/workflows/new')}
          className="apple-btn-primary text-xs py-1.5 px-3"
        >
          + New Workflow
        </button>
      </div>
    </div>
  )
}
