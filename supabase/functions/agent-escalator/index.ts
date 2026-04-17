import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { WorkflowStep } from '../_shared/types.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const { step, input, run_id }: { step: WorkflowStep; input: Record<string, unknown>; run_id: string } = await req.json()

  const triage = input.triage_result as Record<string, unknown> | undefined
  const severity = (triage?.severity_level as string) ?? 'UNKNOWN'
  const summary = (triage?.summary as string) ?? 'An infrastructure alert requires human review before automated resolution.'

  // Emit escalation request — pauses the UI
  await supabase.from('agent_events').insert({
    run_id,
    event_type: 'ESCALATION_REQUESTED',
    source_agent: 'escalator',
    step_id: step.step_id,
    payload: { severity, summary, run_id },
    created_at: new Date().toISOString(),
  })

  // Poll for human decision (max 90s, 2.5s intervals = 36 polls)
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2_500))

    const { data } = await supabase
      .from('agent_events')
      .select('event_type, payload')
      .eq('run_id', run_id)
      .eq('step_id', step.step_id)
      .in('event_type', ['HUMAN_APPROVED', 'HUMAN_REJECTED'])
      .maybeSingle()

    if (data) {
      const approved = data.event_type === 'HUMAN_APPROVED'
      const notes = ((data.payload as Record<string, string>).notes) ?? ''
      return new Response(
        JSON.stringify({
          outputs: {
            escalation_result: {
              outcome: approved ? 'approved' : 'rejected',
              notes,
              severity,
              resolved_at: new Date().toISOString(),
            },
          },
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  // Timeout — record and surface as soft failure
  await supabase.from('agent_events').insert({
    run_id,
    event_type: 'AGENT_ERROR',
    source_agent: 'escalator',
    step_id: step.step_id,
    payload: { error: 'Escalation timed out after 90s — no human response received', severity },
    created_at: new Date().toISOString(),
  })

  return new Response(
    JSON.stringify({
      outputs: {
        escalation_result: {
          outcome: 'timeout',
          notes: 'No human response within 90 seconds',
          severity,
          resolved_at: new Date().toISOString(),
        },
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
