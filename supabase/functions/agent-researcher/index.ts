import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'
import type { WorkflowStep } from '../_shared/types.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })
const EXA_API_KEY = Deno.env.get('EXA_API_KEY')!

Deno.serve(async (req) => {
  const { step, input, run_id, system_prompt: customSystemPrompt }: {
    step: WorkflowStep
    input: Record<string, unknown>
    run_id: string
    system_prompt?: string
  } = await req.json()

  // 1. Use Claude to turn step instructions + context into 2-3 targeted search queries
  const queryMsg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: 'You generate web search queries. Respond with a JSON array of 2-3 concise, specific search strings. No markdown, no explanation. Just the array.',
    messages: [{
      role: 'user',
      content: `Research task: ${step.instructions}\n\nContext from previous steps: ${JSON.stringify(input)}\n\nGenerate 2-3 targeted search queries.`,
    }],
  })

  let queries: string[] = []
  try {
    const raw = (queryMsg.content[0] as { type: string; text: string }).text.trim()
    queries = JSON.parse(raw)
  } catch {
    queries = [step.instructions.slice(0, 100)]
  }

  // 2. Search Exa for each query, collect results
  const allResults: ExaResult[] = []
  for (const query of queries.slice(0, 3)) {
    try {
      const res = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          numResults: 4,
          useAutoprompt: true,
          contents: { text: { maxCharacters: 3000 }, highlights: { numSentences: 3 } },
        }),
      })
      if (res.ok) {
        const data = await res.json() as { results: ExaResult[] }
        allResults.push(...(data.results ?? []))
      }
    } catch (err) {
      console.error(`[researcher] Exa search failed for "${query}":`, err)
    }
  }

  // Deduplicate by URL, cap at 8 sources
  const seen = new Set<string>()
  const sources = allResults.filter(r => {
    if (seen.has(r.url)) return false
    seen.add(r.url)
    return true
  }).slice(0, 8)

  // 3. Synthesise findings with Claude
  const systemPrompt = (customSystemPrompt ?? 'You are a meticulous research analyst.') +
    '\n\nCRITICAL: Respond with valid JSON only — no markdown, no code fences. Just the raw JSON object.'

  const sourceText = sources.map((s, i) =>
    `[${i + 1}] ${s.title} (${s.url})\n${s.text ?? s.highlights?.join(' ') ?? ''}`
  ).join('\n\n---\n\n')

  const synthesisMsg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Research task: ${step.instructions}\n\nSources found:\n${sourceText}\n\nSynthesize into structured findings. Output keys: ${step.output_keys.join(', ')}`,
    }],
  })

  const raw = (synthesisMsg.content[0] as { type: string; text: string }).text.trim()
  let outputs: Record<string, unknown> = {}
  try {
    outputs = JSON.parse(raw)
  } catch {
    // Wrap in first output key if JSON parse fails
    outputs = { [step.output_keys[0] ?? 'research']: raw }
  }

  const tokensUsed = (queryMsg.usage.input_tokens + queryMsg.usage.output_tokens) +
    (synthesisMsg.usage.input_tokens + synthesisMsg.usage.output_tokens)

  await supabase.from('agent_memory').insert({
    run_id,
    step_id: step.step_id,
    agent_role: 'researcher',
    memory_tier: 'episodic',
    key: step.output_keys[0],
    output: { outputs, sources_count: sources.length, queries },
    tokens_used: tokensUsed,
    confidence: 0.85,
    created_at: new Date().toISOString(),
  })

  return new Response(
    JSON.stringify({ outputs }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})

interface ExaResult {
  url: string
  title: string
  text?: string
  highlights?: string[]
  publishedDate?: string
}
