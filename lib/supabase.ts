import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co').trim()
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key').trim()

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

// Singleton for client components
let _client: ReturnType<typeof createClient> | null = null
export function getSupabase() {
  if (!_client) _client = createClient()
  return _client
}
