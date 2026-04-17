'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '/dashboard',     label: 'WORKFLOWS' },
  { href: '/workflows/new', label: 'NEW' },
  { href: '/agents',        label: 'AGENTS' },
  { href: '/reports',       label: 'REPORTS' },
]

export default function Navbar() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()

  // Workflow detail pages are dark — use a dark navbar there
  const isDark = !!pathname?.match(/^\/workflows\/[^/]+$/)

  return (
    <nav className={cn(
      'fixed top-0 inset-x-0 z-40 h-14 border-b backdrop-blur-sm transition-colors',
      isDark
        ? 'border-white/8 bg-[#08080c]/95'
        : 'border-black/10 bg-white/95'
    )}>
      <div className="max-w-5xl mx-auto px-5 sm:px-8 h-full flex items-center gap-8">

        {/* Logo */}
        <Link href="/" className="flex flex-col leading-none flex-shrink-0 group">
          <span className={cn(
            'text-[13px] font-bold tracking-[0.18em] transition-colors',
            isDark ? 'text-white group-hover:text-white/70' : 'text-black group-hover:text-black/70'
          )}>
            DATA-AI
          </span>
          <span className={cn('text-[8px] tracking-[0.14em] uppercase mt-0.5', isDark ? 'text-white/25' : 'text-black/30')}>
            Agent Swarm Automation
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden sm:flex items-center gap-7 flex-1">
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'text-[10px] tracking-[0.14em] font-semibold transition-colors',
                pathname?.startsWith(link.href)
                  ? isDark ? 'text-white' : 'text-black'
                  : isDark ? 'text-white/30 hover:text-white/65' : 'text-black/35 hover:text-black/65'
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Auth */}
        <div className="ml-auto flex items-center gap-5">
          {user ? (
            <>
              <span className={cn('hidden sm:block text-[10px] tracking-widest uppercase max-w-[140px] truncate', isDark ? 'text-white/25' : 'text-black/30')}>
                {user.email}
              </span>
              <button
                onClick={signOut}
                className={cn('text-[10px] tracking-[0.12em] uppercase transition-colors', isDark ? 'text-white/30 hover:text-white/65' : 'text-black/35 hover:text-black/70')}
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className={cn(
                'px-4 py-1.5 border text-[10px] tracking-[0.12em] uppercase transition-colors',
                isDark
                  ? 'border-white/20 text-white/60 hover:text-white hover:border-white/40'
                  : 'border-black/20 text-black/60 hover:text-black hover:border-black/50'
              )}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
