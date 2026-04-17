import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workflow_id } = await req.json()
  if (!workflow_id) return NextResponse.json({ error: 'workflow_id required' }, { status: 400 })

  // Create run record
  const { data: run, error } = await supabase
    .from('workflow_runs')
    .insert({ workflow_id, user_id: user.id, status: 'running', triggered_at: new Date().toISOString() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invoke Supabase orchestrator edge function asynchronously
  const orchestratorUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/orchestrator`
  fetch(orchestratorUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ workflow_id, trigger_context: { source: 'manual', user_id: user.id } }),
  }).catch(err => console.error('Orchestrator invocation failed:', err))

  return NextResponse.json({ run_id: run.id })
}
