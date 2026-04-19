import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { WorkflowStep, DataSource } from '../_shared/types.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  const { step, run_id }: { step: WorkflowStep; run_id: string } = await req.json()
  const outputs: Record<string, unknown> = {}

  for (const source of (step.data_sources ?? [])) {
    const idx = (step.data_sources ?? []).indexOf(source)
    const key = step.output_keys[idx] ?? `source_${idx}`
    try {
      outputs[key] = await fetchSource(source)
    } catch (err) {
      outputs[key] = { error: String(err), source_type: source.type, url: source.url }
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
    case 'http':      return fetchHttp(source)
    case 'web_scrape': return fetchScrape(source)
    case 'google_sheets': return fetchSheets(source)
    default: throw new Error(`Unsupported source type: ${source.type}`)
  }
}

async function fetchHttp(source: DataSource): Promise<unknown> {
  if (!source.url) {
    throw new Error('Data source URL is not configured. Open the workflow editor → Data Sources tab and enter the API URL.')
  }

  const headers: Record<string, string> = { ...(source.headers ?? {}), Accept: 'application/json' }
  if (source.bearer_token) headers['Authorization'] = `Bearer ${source.bearer_token}`

  const init: RequestInit = { method: source.method ?? 'GET', headers }
  if (source.body && (source.method === 'POST' || source.method === 'PUT')) {
    init.body = source.body
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(source.url, init)
  if (!res.ok) throw new Error(`HTTP ${source.method ?? 'GET'} ${source.url} → ${res.status} ${res.statusText}`)

  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) return res.json()

  const text = await res.text()
  // Detect CSV by URL extension or content-type
  if (ct.includes('text/csv') || source.url.endsWith('.csv') || source.url.includes('.csv?')) {
    return { raw_csv: text, url: source.url, fetched_at: new Date().toISOString() }
  }
  return { text: text.slice(0, 20000), url: source.url, fetched_at: new Date().toISOString() }
}

async function fetchScrape(source: DataSource): Promise<unknown> {
  if (!source.url) throw new Error('web_scrape requires a URL. Configure it in the Data Sources tab.')
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
  const token = Deno.env.get('GOOGLE_ACCESS_TOKEN')
  if (!token) throw new Error('GOOGLE_ACCESS_TOKEN not configured')
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
