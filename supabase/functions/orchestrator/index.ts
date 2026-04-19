import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { WorkflowDefinition, WorkflowStep, AgentEvent } from '../_shared/types.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const { workflow_id, trigger_context, run_id: existingRunId } = await req.json()

  const { data: workflow } = await supabase
    .from('workflows')
    .select('definition, id')
    .eq('id', workflow_id)
    .single<{ definition: WorkflowDefinition; id: string }>()

  if (!workflow) return new Response('Workflow not found', { status: 404 })

  const system_prompt = workflow.definition.system_prompt

  // Use the run_id created by the API route if provided; otherwise create one
  let runId: string
  if (existingRunId) {
    runId = existingRunId
  } else {
    const { data: run } = await supabase
      .from('workflow_runs')
      .insert({ workflow_id, status: 'running', triggered_at: new Date().toISOString() })
      .select()
      .single()
    runId = run.id
  }
  const channel = supabase.channel(`run:${runId}`)

  await emit(channel, runId, 'START_WORKFLOW', 'orchestrator', { workflow_id })

  const taskGraph = buildTaskGraph(workflow.definition.steps)
  const workingMemory: Record<string, unknown> = { trigger_context }

  try {
    const deliveryMeta = {
      workflow_name: workflow.definition.name,
      channels: workflow.definition.output.channels,
    }

    for (const phase of taskGraph.phases) {
      const results = await Promise.allSettled(
        phase.map(step => spawnAgent(step, runId, workingMemory, channel, system_prompt, deliveryMeta))
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

    // Always write a report record so the Report tab has something to show
    const reportData: Record<string, string> = {}
    for (const [key, val] of Object.entries(workingMemory)) {
      if (['trigger_context', 'eval_result', 'delivery_receipt'].includes(key)) continue
      if (val == null) continue
      reportData[key.replace(/_/g, ' ')] = typeof val === 'object'
        ? JSON.stringify(val, null, 2)
        : String(val)
    }
    if (Object.keys(reportData).length > 0) {
      await supabase.from('reports').insert({
        run_id: runId,
        title: `${workflow.definition.name} — ${new Date().toLocaleDateString()}`,
        content: {
          report: reportData,
          eval_result: (workingMemory.eval_result as Record<string, unknown>) ?? null,
        },
        format: 'json',
        created_at: new Date().toISOString(),
      }).catch(err => console.error('[Orchestrator] Failed to write report:', err))
    }
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
  system_prompt?: string,
  deliveryMeta?: { workflow_name: string; channels: unknown[] }
): Promise<Record<string, unknown>> {
  await emit(channel, runId, 'TASK_ASSIGNED', 'orchestrator', { step_id: step.step_id, agent_role: step.agent_role })

  const input = Object.fromEntries(step.input_sources.map(k => [k, workingMemory[k]]))

  if (step.consensus) {
    return runConsensus(step, input, runId, channel, system_prompt)
  }

  if (step.critique_loop) {
    return runCritiqueLoop(step, input, runId, channel, system_prompt)
  }

  const extraParams = step.agent_role === 'delivery' && deliveryMeta
    ? { workflow_name: deliveryMeta.workflow_name, channels: deliveryMeta.channels }
    : {}

  const { data, error } = await supabase.functions.invoke(`agent-${step.agent_role}`, {
    body: { step, input, run_id: runId, system_prompt, ...extraParams },
  })
  if (error) throw new Error(`Agent ${step.agent_role} failed: ${error.message}`)

  await emit(channel, runId, 'TASK_COMPLETE', step.agent_role as 'analyst', { step_id: step.step_id })
  return data.outputs
}

async function runCritiqueLoop(
  step: WorkflowStep,
  input: Record<string, unknown>,
  runId: string,
  channel: ReturnType<typeof supabase.channel>,
  system_prompt?: string
): Promise<Record<string, unknown>> {
  const { max_rounds = 2, critic_instructions } = step.critique_loop!
  let currentInput = input
  let analystOutputs: Record<string, unknown> = {}

  for (let round = 0; round < max_rounds; round++) {
    // ── Analyst turn ──────────────────────────────────────────────────────
    const { data: aData, error: aErr } = await supabase.functions.invoke(`agent-${step.agent_role}`, {
      body: { step, input: currentInput, run_id: runId, system_prompt },
    })
    if (aErr) throw new Error(`Agent ${step.agent_role} failed (round ${round + 1}): ${aErr.message}`)
    analystOutputs = aData.outputs

    // ── Critic turn ───────────────────────────────────────────────────────
    await emit(channel, runId, 'CRITIQUE_REQUESTED', step.agent_role as 'analyst', {
      step_id: step.step_id, round, max_rounds,
    })

    const { data: cData, error: cErr } = await supabase.functions.invoke('agent-critic', {
      body: { step, analyst_output: analystOutputs, critic_instructions, run_id: runId, round },
    })
    if (cErr) {
      console.error(`[Orchestrator] Critic failed (round ${round + 1}):`, cErr.message)
      break // Don't block the pipeline on critic failures
    }

    const critique = cData.outputs.critique as {
      approved: boolean; confidence: number; feedback: string; issues: string[]
    }

    if (critique.approved) {
      await emit(channel, runId, 'CRITIQUE_APPROVED', 'critic', {
        step_id: step.step_id, round, confidence: critique.confidence,
      })
      break
    }

    await emit(channel, runId, 'CRITIQUE_FEEDBACK', 'critic', {
      step_id: step.step_id, round, feedback: critique.feedback, issues: critique.issues,
    })

    // Inject feedback so analyst can revise on next round
    currentInput = { ...currentInput, critique_feedback: critique.feedback, critique_issues: critique.issues }
  }

  await emit(channel, runId, 'TASK_COMPLETE', step.agent_role as 'analyst', { step_id: step.step_id })
  return analystOutputs
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
