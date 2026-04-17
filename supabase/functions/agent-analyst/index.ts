import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4'
import type { WorkflowStep } from '../_shared/types.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! })

Deno.serve(async (req) => {
  const { step, input, run_id }: { step: WorkflowStep; input: Record<string, unknown>; run_id: string } = await req.json()

  const prompt = buildPrompt(step.instructions, input)

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are an AI analyst agent. Respond with valid JSON matching the output format specified. If you cannot complete the task, respond with { "error": "reason" }.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  })

  const rawOutput = JSON.parse(completion.choices[0].message.content!)

  for (const key of step.output_keys) {
    if (!(key in rawOutput)) throw new Error(`Agent output missing key: ${key}`)
  }

  await supabase.from('agent_memory').insert({
    run_id,
    step_id: step.step_id,
    agent_role: 'analyst',
    output: rawOutput,
    tokens_used: completion.usage?.total_tokens,
    created_at: new Date().toISOString(),
  })

  return new Response(JSON.stringify({ outputs: rawOutput }), { headers: { 'Content-Type': 'application/json' } })
})

function buildPrompt(instructions: string, input: Record<string, unknown>): string {
  const data = Object.entries(input)
    .map(([k, v]) => `## ${k}\n\`\`\`json\n${JSON.stringify(v, null, 2)}\n\`\`\``)
    .join('\n\n')
  return `${instructions}\n\n---\n\n${data}`
}
