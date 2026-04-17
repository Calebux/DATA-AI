import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params

  // Service-role client — created per-request so env vars are available at runtime
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Load the workflow
  const { data: workflow, error: wfError } = await adminSupabase
    .from('workflows')
    .select('id, status, definition')
    .eq('id', workflowId)
    .single()

  if (wfError || !workflow) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
  }

  if (workflow.status !== 'active') {
    return NextResponse.json({ error: 'Workflow is not active' }, { status: 409 })
  }

  // 2. Optional secret validation (opt-in — only enforced when definition.webhook_secret is set)
  const storedSecret = workflow.definition?.webhook_secret as string | undefined
  if (storedSecret) {
    const incomingSecret = req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '')
    if (incomingSecret !== storedSecret) {
      return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
    }
  }

  // 3. Parse caller payload (best-effort; pass through as trigger_context)
  let triggerContext: Record<string, unknown> = {}
  try {
    const body = await req.text()
    if (body) triggerContext = JSON.parse(body)
  } catch {
    // Non-JSON bodies are fine — treat as empty context
  }

  triggerContext = {
    ...triggerContext,
    source: 'webhook',
    timestamp: new Date().toISOString(),
  }

  // 4. Create run record
  const { data: run, error: runError } = await adminSupabase
    .from('workflow_runs')
    .insert({
      workflow_id: workflowId,
      status: 'running',
      triggered_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (runError || !run) {
    return NextResponse.json({ error: 'Failed to create run' }, { status: 500 })
  }

  // 5. Fire-and-forget orchestrator
  const orchestratorUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/orchestrator`
  fetch(orchestratorUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ workflow_id: workflowId, trigger_context: triggerContext }),
  }).catch(err => console.error('[webhook] Orchestrator invocation failed:', err))

  return NextResponse.json({ run_id: run.id }, { status: 202 })
}
