import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'
import type { WorkflowStep } from '../_shared/types.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

Deno.serve(async (req) => {
  const { step, input, run_id, system_prompt: customSystemPrompt }: {
    step: WorkflowStep
    input: Record<string, unknown>
    run_id: string
    system_prompt?: string
  } = await req.json()

  const systemPrompt = (customSystemPrompt ?? 'You are an AI analyst agent.') +
    '\n\nCRITICAL: Respond with valid JSON only — no markdown, no code fences, no explanation. Just the raw JSON object.'

  const prompt = buildPrompt(step.instructions, input)

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

  let rawOutput: Record<string, unknown>
  try {
    rawOutput = JSON.parse(content.text)
  } catch {
    // Strip markdown code fences if Claude wrapped the JSON
    const match = content.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (match) {
      rawOutput = JSON.parse(match[1])
    } else {
      throw new Error(`Failed to parse JSON from response: ${content.text.slice(0, 300)}`)
    }
  }

  for (const key of step.output_keys) {
    if (!(key in rawOutput)) throw new Error(`Agent output missing key: ${key}`)
  }

  await supabase.from('agent_memory').insert({
    run_id,
    step_id: step.step_id,
    agent_role: 'analyst',
    output: rawOutput,
    tokens_used: (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0),
    created_at: new Date().toISOString(),
  })

  return new Response(JSON.stringify({ outputs: rawOutput }), { headers: { 'Content-Type': 'application/json' } })
})

function buildPrompt(instructions: string, input: Record<string, unknown>): string {
  // Separate critique feedback from regular data inputs
  const { critique_feedback, critique_issues, ...dataInput } = input

  const data = Object.entries(dataInput)
    .map(([k, v]) => `## ${k}\n\`\`\`json\n${JSON.stringify(v, null, 2)}\n\`\`\``)
    .join('\n\n')

  const critiqueSection = critique_feedback
    ? `\n\n---\n\n## REVISION REQUIRED — Critic Feedback\n${critique_feedback}${
        Array.isArray(critique_issues) && critique_issues.length > 0
          ? `\n\nSpecific issues to fix:\n${(critique_issues as string[]).map(i => `- ${i}`).join('\n')}`
          : ''
      }\n\nRevise your output to address all the above points.`
    : ''

  return `${instructions}${critiqueSection}\n\n---\n\n${data}`
}
