import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { WorkflowStep, DeliveryChannel, EvalResult } from '../_shared/types.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  const { step, input, run_id, workflow_name, channels }: {
    step: WorkflowStep; input: Record<string, unknown>; run_id: string; workflow_name: string; channels: DeliveryChannel[]
  } = await req.json()

  const report = extractReport(input)
  const evalResult = input.eval_result as EvalResult
  const results: Record<string, unknown>[] = []

  for (const channel of channels) {
    try {
      const result = await deliver(channel, report, evalResult, workflow_name)
      results.push({ channel: channel.type, status: 'sent', result })
    } catch (err) {
      results.push({ channel: channel.type, status: 'failed', error: String(err) })
    }
  }

  await supabase.from('reports').insert({
    run_id,
    title: `${workflow_name} — ${new Date().toLocaleDateString()}`,
    content: { report, eval_result: evalResult, delivery_results: results },
    format: 'json',
    created_at: new Date().toISOString(),
  })

  const receipt = { delivered_at: new Date().toISOString(), results }
  return new Response(JSON.stringify({ outputs: { delivery_receipt: receipt } }), { headers: { 'Content-Type': 'application/json' } })
})

function extractReport(input: Record<string, unknown>): Record<string, string> {
  // Prefer synthesized_report if present (explicit synthesis step)
  if (input.synthesized_report && typeof input.synthesized_report === 'object') {
    return input.synthesized_report as Record<string, string>
  }
  // Fall back: flatten all non-eval, non-receipt inputs into readable sections
  const r: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (k === 'eval_result' || k === 'delivery_receipt') continue
    if (v == null) continue
    r[k] = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)
  }
  return r
}

async function deliver(channel: DeliveryChannel, report: Record<string, string>, evalResult: EvalResult, name: string): Promise<unknown> {
  if (channel.type === 'email') return sendEmail(channel, report, evalResult, name)
  if (channel.type === 'webhook') return postWebhook(channel, report, evalResult)
  if (channel.type === 'telegram') return sendTelegram(channel, report)
  if (channel.type === 'report') return saveReport(channel, report)
  throw new Error('Unknown channel type')
}

async function sendEmail(channel: Extract<DeliveryChannel, { type: 'email' }>, report: Record<string, string>, evalResult: EvalResult, name: string) {
  const key = Deno.env.get('RESEND_API_KEY')!
  const headline = report.headline ?? report.HEADLINE ?? name
  const subject = channel.subject_template?.replace('{{headline}}', headline) ?? `${name} — ${headline}`
  const score = evalResult.overall_score ? `${(evalResult.overall_score * 10).toFixed(1)}/10` : 'N/A'

  const sections = Object.entries(report)
    .filter(([k]) => k !== 'headline' && k !== 'HEADLINE')
    .map(([k, v]) => `<h2 style="color:#635BFF;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:24px">${k.replace(/_/g,' ')}</h2><p style="font-size:14px;line-height:1.7;color:#1a1a2e;white-space:pre-wrap">${v}</p>`)
    .join('')

  const html = `<!DOCTYPE html><html><body style="background:#f8f8ff;padding:32px 0"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden"><div style="background:#635BFF;padding:24px 32px"><h1 style="color:#fff;font-size:20px;margin:0">${headline}</h1></div><div style="padding:24px 32px">${sections}</div><div style="background:#f0f0ff;padding:12px 32px;font-size:11px;color:#888">Report quality: ${score} · DATA-AI</div></div></body></html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'DATA-AI <onboarding@resend.dev>', to: channel.to, subject, html }),
  })
  if (!res.ok) throw new Error(`Resend failed: ${await res.text()}`)
  return res.json()
}

async function postWebhook(channel: Extract<DeliveryChannel, { type: 'webhook' }>, report: Record<string, string>, evalResult: EvalResult) {
  const res = await fetch(channel.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(channel.headers ?? {}) },
    body: JSON.stringify({ source: 'data-ai', report, quality_score: evalResult.overall_score, generated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`Webhook failed: ${res.status}`)
  return { status: res.status }
}

async function sendTelegram(channel: Extract<DeliveryChannel, { type: 'telegram' }>, report: Record<string, string>) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')!
  const text = Object.entries(report).map(([k, v]) => `*${k.toUpperCase()}*\n${v}`).join('\n\n').slice(0, 4000)
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: channel.chat_id, text, parse_mode: 'Markdown' }),
  })
  if (!res.ok) throw new Error(`Telegram failed: ${res.status}`)
  return res.json()
}

async function saveReport(channel: Extract<DeliveryChannel, { type: 'report' }>, report: Record<string, string>) {
  const filename = `report-${Date.now()}.json`
  const { data, error } = await supabase.storage
    .from('reports')
    .upload(filename, new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
  if (error) throw new Error(`Storage failed: ${error.message}`)
  return { path: data.path }
}
