import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { WorkflowDefinition, WorkflowStep, AgentEvent } from '../_shared/types.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const { workflow_id, trigger_context } = await req.json()

  const { data: workflow } = await supabase
    .from('workflows')
    .select('definition, id')
    .eq('id', workflow_id)
    .single<{ definition: WorkflowDefinition; id: string }>()

  if (!workflow) return new Response('Workflow not found', { status: 404 })

  const system_prompt = workflow.definition.system_prompt

  const { data: run } = await supabase
    .from('workflow_runs')
    .insert({ workflow_id, status: 'running', triggered_at: new Date().toISOString() })
    .select()
    .single()

  const runId: string = run.id
  const channel = supabase.channel(`run:${runId}`)

  await emit(channel, runId, 'START_WORKFLOW', 'orchestrator', { workflow_id })

  const taskGraph = buildTaskGraph(workflow.definition.steps)
  const workingMemory: Record<string, unknown> = { trigger_context }

  try {
    for (const phase of taskGraph.phases) {
      const results = await Promise.allSettled(
        phase.map(step => spawnAgent(step, runId, workingMemory, channel, system_prompt))
      )
      for (const result of results) {
        if (result.status === 'fulfilled') {
          Object.assign(workingMemory, result.value)
        } else {
          console.error('[Orchestrator] Agent failure:', result.reason)
        }
      }
    }

    await supabase.from('workflow_runs')
      .update({ status: 'complete', completed_at: new Date().toISOString() })
      .eq('id', runId)

    await emit(channel, runId, 'WORKFLOW_COMPLETE', 'orchestrator', {})
  } catch (err) {
    await supabase.from('workflow_runs')
      .update({ status: 'failed', error_message: String(err) })
      .eq('id', runId)
  }

  await channel.unsubscribe()
  return new Response(JSON.stringify({ run_id: runId, status: 'complete' }))
})

function buildTaskGraph(steps: WorkflowStep[]) {
  const resolved = new Set<string>()
  const phases: WorkflowStep[][] = []
  let remaining = [...steps]
  while (remaining.length > 0) {
    const ready = remaining.filter(s => s.depends_on.every(d => resolved.has(d)))
    if (!ready.length) throw new Error('Circular dependency in workflow steps')
    phases.push(ready)
    ready.forEach(s => resolved.add(s.step_id))
    remaining = remaining.filter(s => !ready.includes(s))
  }
  return { phases }
}

async function spawnAgent(
  step: WorkflowStep,
  runId: string,
  workingMemory: Record<string, unknown>,
  channel: ReturnType<typeof supabase.channel>,
  system_prompt?: string
): Promise<Record<string, unknown>> {
  await emit(channel, runId, 'TASK_ASSIGNED', 'orchestrator', { step_id: step.step_id, agent_role: step.agent_role })

  const input = Object.fromEntries(step.input_sources.map(k => [k, workingMemory[k]]))

  if (step.consensus) {
    return runConsensus(step, input, runId, channel, system_prompt)
  }

  const { data, error } = await supabase.functions.invoke(`agent-${step.agent_role}`, {
    body: { step, input, run_id: runId, system_prompt },
  })
  if (error) throw new Error(`Agent ${step.agent_role} failed: ${error.message}`)

  await emit(channel, runId, 'TASK_COMPLETE', step.agent_role as 'analyst', { step_id: step.step_id })
  return data.outputs
}

async function runConsensus(
  step: WorkflowStep,
  input: Record<string, unknown>,
  runId: string,
  channel: ReturnType<typeof supabase.channel>,
  system_prompt?: string
): Promise<Record<string, unknown>> {
  const { agent_count, agreement_threshold, reconciliation } = step.consensus!
  await emit(channel, runId, 'CONSENSUS_START', 'orchestrator', { step_id: step.step_id, agent_count })

  const instanceIds = Array.from({ length: agent_count }, () => crypto.randomUUID())
  const results = await Promise.allSettled(
    instanceIds.map(instance_id =>
      supabase.functions.invoke(`agent-${step.agent_role}`, {
        body: { step, input, run_id: runId, instance_id, system_prompt },
      })
    )
  )

  const successful: { outputs: Record<string, unknown>; instanceId: string }[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled') {
      successful.push({ outputs: r.value.data.outputs, instanceId: instanceIds[i] })
    }
  }

  if (successful.length < Math.ceil(agent_count * agreement_threshold)) {
    throw new Error(`Consensus failed: only ${successful.length}/${agent_count} succeeded`)
  }

  // Emit individual votes before reconciliation so the UI can show disagreements
  for (let i = 0; i < successful.length; i++) {
    const { outputs, instanceId } = successful[i]
    await emit(channel, runId, 'CONSENSUS_VOTE', step.agent_role as 'analyst', {
      step_id: step.step_id,
      instance_id: instanceId,
      vote_index: i,
      agent_count,
      outputs,
      confidence: extractConf(outputs, step.output_keys),
    })
  }

  const winner = reconciliation === 'highest_confidence'
    ? successful.reduce((best, curr) => {
        const bConf = extractConf(best.outputs, step.output_keys)
        const cConf = extractConf(curr.outputs, step.output_keys)
        return cConf > bConf ? curr : best
      }).outputs
    : successful[Math.floor(successful.length / 2)].outputs

  await emit(channel, runId, 'CONSENSUS_RESOLVED', 'orchestrator', {
    step_id: step.step_id,
    winner_confidence: extractConf(winner, step.output_keys),
  })
  return winner
}

function extractConf(outputs: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const v = outputs[key] as Record<string, number> | undefined
    if (v?.confidence !== undefined) return v.confidence
  }
  return 0
}

async function emit(
  channel: ReturnType<typeof supabase.channel>,
  runId: string,
  eventType: string,
  sourceAgent: string,
  payload: Record<string, unknown>
) {
  await supabase.from('agent_events').insert({
    run_id: runId,
    event_type: eventType,
    source_agent: sourceAgent,
    step_id: payload.step_id ?? null,
    payload,
    created_at: new Date().toISOString(),
  })
  channel.send({ type: 'broadcast', event: 'agent_event', payload: { event_type: eventType, source_agent: sourceAgent, ...payload } })
}
