import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4'
import type { WorkflowStep, EvalResult } from '../_shared/types.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! })

Deno.serve(async (req) => {
  const { step, input, run_id }: { step: WorkflowStep; input: Record<string, unknown>; run_id: string } = await req.json()

  let attempts = 0
  let evalResult: EvalResult
  let currentInput = { ...input }

  do {
    attempts++

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a quality control agent. Score reports on completeness, specificity, actionability, and tone (0.0–1.0 each). Be strict — 0.75 is the minimum bar.',
        },
        {
          role: 'user',
          content: `Score this report:\n\`\`\`json\n${JSON.stringify(currentInput.synthesized_report, null, 2)}\n\`\`\`\n\n${step.instructions}`,
        },
      ],
      response_format: { type: 'json_object' },
    })

    evalResult = JSON.parse(completion.choices[0].message.content!) as EvalResult

    if (!evalResult.pass && attempts < (step.max_retries ?? 2)) {
      // Retry synthesis with feedback
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
})
