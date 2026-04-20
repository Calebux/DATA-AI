'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function Navbar() {
  const router = useRouter()
  const { user, signOut } = useAuth()

  async function handleSignOut() {
    await signOut()
    router.push('/')
  }

  return (
    <nav className="fixed top-0 inset-x-0 z-40 h-14 bg-black border-b border-white/10">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 h-full flex items-center">

        {/* Logo */}
        <Link href="/" className="flex flex-col leading-none flex-shrink-0 group">
          <span className="text-[13px] font-bold tracking-[0.18em] text-white group-hover:text-white/70 transition-colors">
            HoursBack
          </span>
          <span className="text-[8px] tracking-[0.14em] uppercase mt-0.5 text-white/25">
            Agent Swarm Automation
          </span>
        </Link>

        {/* Auth */}
        <div className="ml-auto flex items-center gap-5">
          {user ? (
            <>
              <span className="hidden sm:block text-[10px] tracking-widest uppercase max-w-[140px] truncate text-white/25">
                {user.email}
              </span>
              <Link
                href="/profile"
                className="text-[10px] tracking-[0.12em] uppercase transition-colors text-white/30 hover:text-white/65"
              >
                Profile
              </Link>
              <button
                onClick={handleSignOut}
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
