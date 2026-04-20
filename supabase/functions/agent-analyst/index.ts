import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'
import type { WorkflowStep } from '../_shared/types.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

Deno.serve(async (req) => {
  try {
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
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

    let rawOutput: Record<string, unknown>
    try {
      rawOutput = JSON.parse(content.text)
    } catch {
      // Try stripping markdown code fences (complete or truncated)
      const fenceMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)\s*(?:```|$)/)
      const candidate = fenceMatch ? fenceMatch[1] : content.text
      // Find the outermost JSON object even if trailing content exists
      const start = candidate.indexOf('{')
      const end = candidate.lastIndexOf('}')
      if (start !== -1 && end !== -1 && end > start) {
        rawOutput = JSON.parse(candidate.slice(start, end + 1))
      } else {
        throw new Error(`Failed to parse JSON from response: ${content.text.slice(0, 300)}`)
      }
    }

    // If none of the expected keys are present, Claude returned the content
    // directly without the wrapper key — wrap it under the first expected key
    const missingKeys = step.output_keys.filter(k => !(k in rawOutput))
    if (missingKeys.length === step.output_keys.length && step.output_keys.length === 1) {
      rawOutput = { [step.output_keys[0]]: rawOutput }
    } else if (missingKeys.length > 0) {
      throw new Error(`Agent output missing key(s): ${missingKeys.join(', ')}`)
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[agent-analyst] error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
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
