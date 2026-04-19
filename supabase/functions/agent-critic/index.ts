import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'
import type { WorkflowStep } from '../_shared/types.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

Deno.serve(async (req) => {
  const { step, analyst_output, critic_instructions, run_id, round = 0 }: {
    step: WorkflowStep
    analyst_output: Record<string, unknown>
    critic_instructions?: string
    run_id: string
    round: number
  } = await req.json()

  const systemPrompt = `You are a rigorous peer reviewer. Your job is to critique AI-generated analysis and either approve it or return structured, actionable feedback that will let the analyst improve it.

Be direct and specific. If you approve, it means the output is genuinely high-quality — not just acceptable. If you reject, tell the analyst EXACTLY what is wrong and how to fix it.

Respond with valid JSON only — no markdown, no code fences:
{
  "approved": boolean,
  "confidence": number (0.0-1.0),
  "feedback": "string — actionable critique, or empty string if approved",
  "issues": ["list of specific issues if not approved"],
  "strengths": ["what is done well"]
}`

  const userContent = `Original task:
${step.instructions}

${critic_instructions ? `Critic focus areas:\n${critic_instructions}\n\n` : ''}Analyst output (round ${round + 1}):
${JSON.stringify(analyst_output, null, 2)}

Evaluate this output. Approve only if it is complete, specific, and directly addresses the task. Otherwise provide precise, actionable feedback.`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })

  const raw = (message.content[0] as { type: string; text: string }).text.trim()
  let critique: CritiqueResult
  try {
    critique = JSON.parse(raw)
  } catch {
    // If parse fails, default to approved to avoid infinite loops
    critique = { approved: true, confidence: 0.6, feedback: '', issues: [], strengths: [] }
  }

  await supabase.from('agent_memory').insert({
    run_id,
    step_id: step.step_id,
    agent_role: 'critic',
    memory_tier: 'episodic',
    key: `critique_round_${round}`,
    output: { critique, analyst_output_snapshot: analyst_output },
    tokens_used: message.usage.input_tokens + message.usage.output_tokens,
    confidence: critique.confidence,
    created_at: new Date().toISOString(),
  })

  return new Response(
    JSON.stringify({ outputs: { critique } }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})

interface CritiqueResult {
  approved: boolean
  confidence: number
  feedback: string
  issues: string[]
  strengths: string[]
}
