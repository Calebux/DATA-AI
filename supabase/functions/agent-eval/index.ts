import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'
import type { WorkflowStep, EvalResult } from '../_shared/types.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

Deno.serve(async (req) => {
  try {
    const { step, input, run_id }: { step: WorkflowStep; input: Record<string, unknown>; run_id: string } = await req.json()

    let attempts = 0
    let evalResult: EvalResult
    let currentInput = { ...input }

    do {
      attempts++

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: 'You are a quality control agent. Score reports on completeness, specificity, actionability, and tone (0.0–1.0 each). Be strict — 0.75 is the minimum bar. Respond with valid JSON only — no markdown, no code fences.',
        messages: [
          {
            role: 'user',
            content: `Score this report:\n\`\`\`json\n${JSON.stringify(currentInput.synthesized_report, null, 2)}\n\`\`\`\n\n${step.instructions}`,
          },
        ],
      })

      const content = message.content[0]
      if (content.type !== 'text') throw new Error('Unexpected response type')

      let parsed: EvalResult
      try {
        parsed = JSON.parse(content.text) as EvalResult
      } catch {
        const match = content.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
        parsed = JSON.parse(match ? match[1] : content.text) as EvalResult
      }
      evalResult = parsed

      if (!evalResult.pass && attempts < (step.max_retries ?? 2)) {
        const { data } = await supabase.functions.invoke('agent-analyst', {
          body: {
            step: {
              ...step,
              instructions: step.instructions + `\n\n## PREVIOUS ATTEMPT FEEDBACK\n${evalResult.feedback}\n\nAddress ALL points above.`,
            },
            input: currentInput,
            run_id,
          },
        })
        currentInput.synthesized_report = data.outputs.synthesized_report
      }
    } while (!evalResult!.pass && attempts < (step.max_retries ?? 2))

    const finalScore = evalResult!.overall_score ?? (evalResult!.scores
      ? Object.values(evalResult!.scores).reduce((a, b) => a + b, 0) / 4
      : undefined)

    if (finalScore != null) {
      await supabase.from('workflow_runs').update({ quality_score: finalScore }).eq('id', run_id)
    }

    return new Response(JSON.stringify({
      outputs: { eval_result: { ...evalResult!, attempts_taken: attempts } },
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[agent-eval] error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
