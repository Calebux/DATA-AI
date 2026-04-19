import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async () => {
  const now = new Date()

  // Find all active workflows with a cron trigger
  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('id, definition')
    .eq('status', 'active')

  if (error) {
    console.error('[cron-runner] Failed to fetch workflows:', error.message)
    return new Response('error', { status: 500 })
  }

  const due = (workflows ?? []).filter(wf => {
    const trigger = wf.definition?.trigger
    if (trigger?.type !== 'cron' || !trigger?.cron_expression) return false
    return cronMatchesNow(trigger.cron_expression, now)
  })

  if (due.length === 0) {
    return new Response(JSON.stringify({ fired: 0 }), { status: 200 })
  }

  // Dedup: skip workflows that already have a run started in this minute
  const minuteStart = new Date(now)
  minuteStart.setSeconds(0, 0)

  const { data: recentRuns } = await supabase
    .from('workflow_runs')
    .select('workflow_id')
    .in('workflow_id', due.map(w => w.id))
    .gte('triggered_at', minuteStart.toISOString())

  const alreadyFired = new Set((recentRuns ?? []).map(r => r.workflow_id))
  const toFire = due.filter(w => !alreadyFired.has(w.id))

  let fired = 0
  for (const wf of toFire) {
    // Create run record
    const { data: run, error: runErr } = await supabase
      .from('workflow_runs')
      .insert({
        workflow_id: wf.id,
        status: 'running',
        triggered_at: now.toISOString(),
      })
      .select()
      .single()

    if (runErr || !run) {
      console.error(`[cron-runner] Failed to create run for ${wf.id}:`, runErr?.message)
      continue
    }

    // Fire orchestrator (non-blocking)
    const orchestratorUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/orchestrator`
    fetch(orchestratorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        workflow_id: wf.id,
        run_id: run.id,
        trigger_context: { source: 'cron', scheduled_at: now.toISOString() },
      }),
    }).catch(err => {
      console.error(`[cron-runner] Orchestrator call failed for ${wf.id}:`, err)
      supabase.from('workflow_runs')
        .update({ status: 'failed', error_message: String(err) })
        .eq('id', run.id)
        .then(() => {})
    })

    fired++
  }

  console.log(`[cron-runner] Fired ${fired} workflow(s) at ${now.toISOString()}`)
  return new Response(JSON.stringify({ fired, skipped: due.length - toFire.length }), { status: 200 })
})

/**
 * Returns true if the cron expression matches the given date (minute precision).
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 */
function cronMatchesNow(expr: string, now: Date): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const [min, hour, dom, , dow] = parts

  const nowMin  = now.getUTCMinutes()
  const nowHour = now.getUTCHours()
  const nowDom  = now.getUTCDate()
  const nowDow  = now.getUTCDay() === 0 ? 7 : now.getUTCDay() // 1=Mon … 7=Sun

  return (
    matchField(min,  nowMin)  &&
    matchField(hour, nowHour) &&
    matchField(dom,  nowDom)  &&
    matchField(dow,  nowDow)
  )
}

function matchField(field: string, value: number): boolean {
  if (field === '*') return true
  if (field.includes('/')) {
    const [, step] = field.split('/')
    return value % parseInt(step) === 0
  }
  if (field.includes(',')) {
    return field.split(',').some(f => parseInt(f) === value)
  }
  if (field.includes('-')) {
    const [lo, hi] = field.split('-').map(Number)
    return value >= lo && value <= hi
  }
  return parseInt(field) === value
}
