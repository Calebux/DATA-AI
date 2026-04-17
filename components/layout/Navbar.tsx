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

  return (
    <nav className="fixed top-0 inset-x-0 z-40 h-14 bg-black border-b border-white/10">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 h-full flex items-center gap-8">

        {/* Logo */}
        <Link href="/" className="flex flex-col leading-none flex-shrink-0 group">
          <span className="text-[13px] font-bold tracking-[0.18em] text-white group-hover:text-white/70 transition-colors">
            DATA-AI
          </span>
          <span className="text-[8px] tracking-[0.14em] uppercase mt-0.5 text-white/25">
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
                  ? 'text-white'
                  : 'text-white/30 hover:text-white/65'
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
              <span className="hidden sm:block text-[10px] tracking-widest uppercase max-w-[140px] truncate text-white/25">
                {user.email}
              </span>
              <button
                onClick={signOut}
                className="text-[10px] tracking-[0.12em] uppercase transition-colors text-white/30 hover:text-white/65"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="px-4 py-1.5 border border-white/20 text-[10px] tracking-[0.12em] uppercase transition-colors text-white/60 hover:text-white hover:border-white/40"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
