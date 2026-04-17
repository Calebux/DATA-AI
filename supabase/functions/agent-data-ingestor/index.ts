import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { WorkflowStep, DataSource } from '../_shared/types.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  const { step, run_id }: { step: WorkflowStep; run_id: string } = await req.json()
  const outputs: Record<string, unknown> = {}

  for (const source of (step.data_sources ?? [])) {
    try {
      const data = await fetchSource(source)
      const idx = (step.data_sources ?? []).indexOf(source)
      const key = step.output_keys[idx] ?? `source_${idx}`
      outputs[key] = data
    } catch (err) {
      const idx = (step.data_sources ?? []).indexOf(source)
      const key = step.output_keys[idx] ?? `source_error_${idx}`
      outputs[key] = { error: String(err) }
    }
  }

  // If single output key, merge all source results
  if (step.output_keys.length === 1 && (step.data_sources ?? []).length > 1) {
    const merged = Object.values(outputs).reduce((acc, val) => ({ ...(acc as object), ...(val as object) }), {})
    const key = step.output_keys[0]
    const result = { [key]: merged }
    await supabase.from('agent_memory').insert({ run_id, step_id: step.step_id, agent_role: 'data_ingestor', output: result, created_at: new Date().toISOString() })
    return new Response(JSON.stringify({ outputs: result }), { headers: { 'Content-Type': 'application/json' } })
  }

  await supabase.from('agent_memory').insert({ run_id, step_id: step.step_id, agent_role: 'data_ingestor', output: outputs, created_at: new Date().toISOString() })
  return new Response(JSON.stringify({ outputs }), { headers: { 'Content-Type': 'application/json' } })
})

async function fetchSource(source: DataSource): Promise<unknown> {
  switch (source.type) {
    case 'api': return fetchApi(source)
    case 'web_scrape': return fetchScrape(source)
    case 'google_sheets': return fetchSheets(source)
    default: throw new Error(`Unsupported source type: ${source.type}`)
  }
}

async function fetchApi(source: DataSource): Promise<unknown> {
  switch (source.connector?.toLowerCase()) {
    case 'stripe': return fetchStripe()
    case 'hubspot': return fetchHubSpot()
    default: throw new Error(`Unknown connector: ${source.connector}`)
  }
}

async function fetchStripe(): Promise<unknown> {
  const key = Deno.env.get('STRIPE_SECRET_KEY')!
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400

  const [subs, charges] = await Promise.all([
    stripeGet(key, `/v1/subscriptions?status=active&limit=100`),
    stripeGet(key, `/v1/charges?created[gte]=${sevenDaysAgo}&limit=100`),
  ])

  const activeSubs = (subs as { data: { items?: { data?: { price?: { unit_amount?: number; recurring?: { interval: string } } }[] }; }[] }).data ?? []
  const mrr = activeSubs.reduce((sum, sub) => {
    const amount = sub.items?.data?.[0]?.price?.unit_amount ?? 0
    const interval = sub.items?.data?.[0]?.price?.recurring?.interval
    return sum + (interval === 'year' ? amount / 12 : amount) / 100
  }, 0)

  return { mrr_current: Math.round(mrr), recent_charges: (charges as { data: unknown[] }).data ?? [], fetched_at: new Date().toISOString() }
}

async function stripeGet(key: string, path: string): Promise<unknown> {
  const res = await fetch(`https://api.stripe.com${path}`, { headers: { Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`Stripe ${path}: ${res.status}`)
  return res.json()
}

async function fetchHubSpot(): Promise<unknown> {
  const token = Deno.env.get('HUBSPOT_ACCESS_TOKEN')!
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const inactive = new Date(Date.now() - 21 * 86400000).getTime().toString()

  const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'lastmodifieddate', operator: 'LT', value: inactive }] }],
      properties: ['email', 'firstname', 'lastname', 'company', 'lastmodifieddate'],
      limit: 50,
    }),
  })
  const contacts = await res.json()
  return { inactive_contacts: contacts.results ?? [], fetched_at: new Date().toISOString() }
}

async function fetchScrape(source: DataSource): Promise<unknown> {
  if (!source.url) throw new Error('web_scrape requires url')
  const res = await fetch(source.url, { headers: { 'User-Agent': 'DATA-AI/1.0' } })
  if (!res.ok) throw new Error(`Scrape ${source.url}: ${res.status}`)
  const html = await res.text()
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)
  return { url: source.url, content: text, scraped_at: new Date().toISOString() }
}

async function fetchSheets(source: DataSource): Promise<unknown> {
  if (!source.spreadsheet_id) throw new Error('google_sheets requires spreadsheet_id')
  const token = Deno.env.get('GOOGLE_ACCESS_TOKEN')!
  const range = `${source.sheet_name ?? 'Sheet1'}!A1:Z1000`
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${source.spreadsheet_id}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Sheets: ${res.status}`)
  const { values } = await res.json()
  if (!values?.length) return { rows: [], headers: [] }
  const [headers, ...rows] = values as string[][]
  return { headers, rows: rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? null]))), fetched_at: new Date().toISOString() }
}
