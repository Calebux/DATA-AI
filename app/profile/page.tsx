'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { LogOut, Settings, Mail, Fingerprint, ShieldAlert, Cpu } from 'lucide-react'

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth')
  }, [user, authLoading, router])

  if (authLoading || !user) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="text-black/20" />
      </div>
    )
  }

  const handleSignOut = async () => {
    setLoading(true)
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.push('/auth')
  }

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8 space-y-8">
        
        {/* Header content */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-black">Account Settings</h2>
          <p className="text-sm text-black/50 mt-1">
            Manage your account details and platform preferences.
          </p>
        </div>

        {/* Identity Card */}
        <div className="apple-card overflow-hidden">
          <div className="px-6 py-4 border-b border-black/5 tracking-tight font-bold text-black flex items-center gap-2 bg-black/[0.02]">
            <Settings className="h-4 w-4 text-black/40" /> Identity
          </div>
          <div className="p-6 space-y-6">
            <div>
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-black/40 mb-2">
                <Mail className="h-3.5 w-3.5" /> Email Address
              </span>
              <p className="text-sm font-medium text-black">{user.email}</p>
            </div>
            
            <div className="pt-4 border-t border-black/5">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-black/40 mb-2">
                <Fingerprint className="h-3.5 w-3.5" /> Account ID
              </span>
              <div className="flex items-center gap-3">
                <code className="text-xs font-mono bg-black/5 px-2 py-1 rounded border border-black/10 text-black/70">
                  {user.id}
                </code>
              </div>
              <p className="text-xs text-black/40 mt-2 leading-relaxed">
                Unique identifier for API access and webhook webhooks.
              </p>
            </div>
          </div>
        </div>

        {/* Integration Card (Mocked visual, not functional right now) */}
        <div className="apple-card overflow-hidden opacity-60 pointer-events-none">
          <div className="px-6 py-4 border-b border-black/5 tracking-tight font-bold text-black flex items-center gap-2 bg-black/[0.02]">
            <Cpu className="h-4 w-4 text-black/40" /> Model Configuration
          </div>
          <div className="p-6">
             <div className="flex items-center gap-3 mb-4">
                <ShieldAlert className="h-4 w-4 text-orange-500" />
                <p className="text-sm text-black/60 font-medium">Platform Managed Intelligence</p>
             </div>
             <p className="text-xs text-black/40 leading-relaxed max-w-lg">
               You are currently using the default managed AI service layer. Global provider API keys (OpenAI, Anthropic) are securely managed backend. At this time, custom private keys are not required.
             </p>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="mt-12 pt-8 border-t border-black/10">
          <button 
            onClick={handleSignOut}
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 border border-red-500/20 bg-red-500/5 text-red-600 hover:bg-red-500/10 hover:border-red-500/30 text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? <Spinner size="sm" className="text-red-600" /> : <LogOut className="h-4 w-4" />}
            Sign out of workspace
          </button>
        </div>

      </div>
  )
}
