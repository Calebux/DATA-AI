import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { after } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workflow_id, trigger_context: userContext = {} } = await req.json()
  if (!workflow_id) return NextResponse.json({ error: 'workflow_id required' }, { status: 400 })

  // Use service-role client for the insert so RLS doesn't block it
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: run, error } = await adminSupabase
    .from('workflow_runs')
    .insert({ workflow_id, user_id: user.id, status: 'running', triggered_at: new Date().toISOString() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const orchestratorUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/orchestrator`
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // after() keeps this fetch alive after the response is sent (required on Vercel serverless)
  after(async () => {
    try {
      const res = await fetch(orchestratorUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ workflow_id, run_id: run.id, trigger_context: { ...userContext, source: 'manual', user_id: user.id } }),
      })
      if (!res.ok) {
        const body = await res.text()
        console.error(`Orchestrator returned ${res.status}:`, body)
        await adminSupabase
          .from('workflow_runs')
          .update({ status: 'failed', error_message: `Orchestrator error ${res.status}: ${body.slice(0, 200)}` })
          .eq('id', run.id)
      }
    } catch (err) {
      console.error('Orchestrator invocation failed:', err)
      await adminSupabase
        .from('workflow_runs')
        .update({ status: 'failed', error_message: String(err) })
        .eq('id', run.id)
    }
  })

  return NextResponse.json({ run_id: run.id })
}
