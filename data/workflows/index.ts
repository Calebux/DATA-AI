import type { WorkflowTemplate } from '@/types'

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ─── Finance ──────────────────────────────────────────────────────────────
  {
    id: 'weekly-saas-intel',
    name: 'Weekly SaaS Intelligence Report',
    category: 'finance_executive',
    description: 'Pull Stripe + HubSpot data, score churn risk, flag competitive threats, deliver CEO briefing by 8AM Monday.',
    icon: 'TrendingUp',
    prompt: 'Analyse MRR changes, identify at-risk accounts, and summarise competitive signals for the week.',
    system_prompt: 'You are a senior SaaS analyst. You pull financial and CRM data, identify business risks, and write concise CEO briefings. Be direct, data-driven, and flag only what matters. Every sentence must contain a number, a risk, or an action.',
    triggers: ['cron'],
    outputs: ['email', 'webhook'],
    definition: {
      name: 'Weekly SaaS Intelligence Report',
      category: 'finance_executive',
      trigger: { type: 'cron', cron_expression: '0 8 * * MON', timezone: 'America/New_York' },
      steps: [
        { step_id: 'ingest_stripe', agent_role: 'data_ingestor', depends_on: [], instructions: 'Pull MRR, new/churned subscriptions, and payment failures from Stripe for the last 7 days.', data_sources: [{ type: 'api', connector: 'stripe' }], input_sources: [], output_keys: ['stripe_data'], timeout_ms: 30000 },
        { step_id: 'ingest_hubspot', agent_role: 'data_ingestor', depends_on: [], instructions: 'Pull deals closed, inactive contacts (>21 days), support ticket counts, and NPS scores from HubSpot.', data_sources: [{ type: 'api', connector: 'hubspot' }], input_sources: [], output_keys: ['hubspot_data'], timeout_ms: 30000 },
        { step_id: 'analyze_revenue', agent_role: 'analyst', depends_on: ['ingest_stripe'], instructions: 'Calculate WoW MRR change, identify primary driver, flag anomalies. Output: { summary, mrr_change_pct, primary_driver, anomalies, arr_implied, risk_level }', input_sources: ['stripe_data'], output_keys: ['revenue_analysis'], timeout_ms: 60000 },
        { step_id: 'analyze_churn_risk', agent_role: 'analyst', depends_on: ['ingest_stripe', 'ingest_hubspot'], instructions: 'Score churn probability for each flagged account. Rank top 5 by revenue impact × probability. Output: { at_risk_accounts, total_revenue_at_risk, confidence }', input_sources: ['stripe_data', 'hubspot_data'], output_keys: ['churn_analysis'], timeout_ms: 90000, consensus: { agent_count: 3, agreement_threshold: 0.67, reconciliation: 'highest_confidence' } },
        { step_id: 'synthesize', agent_role: 'analyst', depends_on: ['analyze_revenue', 'analyze_churn_risk'], instructions: 'Write a CEO briefing with sections: HEADLINE, REVENUE, CUSTOMERS AT RISK, RECOMMENDED ACTIONS. Direct tone, no filler.', input_sources: ['revenue_analysis', 'churn_analysis'], output_keys: ['synthesized_report'], timeout_ms: 60000 },
        { step_id: 'eval_report', agent_role: 'eval', depends_on: ['synthesize'], instructions: 'Score completeness, specificity, actionability, tone (0–1 each). Fail if any < 0.75.', input_sources: ['synthesized_report'], output_keys: ['eval_result'], retry_target: 'synthesize', max_retries: 2, timeout_ms: 30000 },
        { step_id: 'deliver', agent_role: 'delivery', depends_on: ['eval_report'], instructions: 'Format as HTML email and send to configured recipients.', input_sources: ['synthesized_report', 'eval_result'], output_keys: ['delivery_receipt'], timeout_ms: 15000 },
      ],
      output: { channels: [{ type: 'email', to: [] }, { type: 'report', format: 'pdf' }] },
    },
  },
  {
    id: 'monthly-revenue-summary',
    name: 'Monthly Revenue Summary',
    category: 'finance_executive',
    description: 'Full P&L analysis, MoM and YoY comparisons, and a board-ready summary every month.',
    icon: 'DollarSign',
    prompt: 'Analyse revenue changes month over month, identify top drivers, and produce a board-ready summary.',
    system_prompt: 'You are a CFO-level financial analyst. You produce board-ready revenue summaries with exact figures, variance analysis, and clear trend narratives. No vague language — every claim is backed by data. Output structured sections: SUMMARY, REVENUE BREAKDOWN, TREND ANALYSIS, FORECAST.',
    triggers: ['cron'],
    outputs: ['email', 'pdf'],
    definition: {
      name: 'Monthly Revenue Summary',
      category: 'finance_executive',
      trigger: { type: 'cron', cron_expression: '0 9 1 * *', timezone: 'America/New_York' },
      steps: [
        { step_id: 'ingest_financials', agent_role: 'data_ingestor', depends_on: [], instructions: 'Pull 13 months of revenue data from Stripe including MRR, ARR, new/expansion/churn breakdown.', data_sources: [{ type: 'api', connector: 'stripe' }], input_sources: [], output_keys: ['financial_data'], timeout_ms: 45000 },
        { step_id: 'analyze', agent_role: 'analyst', depends_on: ['ingest_financials'], instructions: 'Compute MoM and YoY growth rates, identify revenue cohorts, flag anomalies, write board summary.', input_sources: ['financial_data'], output_keys: ['revenue_report'], timeout_ms: 90000 },
        { step_id: 'eval', agent_role: 'eval', depends_on: ['analyze'], instructions: 'Verify all figures are cited with exact numbers. Score accuracy and board-readiness.', input_sources: ['revenue_report'], output_keys: ['eval_result'], max_retries: 1, timeout_ms: 30000 },
        { step_id: 'deliver', agent_role: 'delivery', depends_on: ['eval'], instructions: 'Send as formatted email + attach PDF to configured recipients.', input_sources: ['revenue_report', 'eval_result'], output_keys: ['delivery_receipt'], timeout_ms: 15000 },
      ],
      output: { channels: [{ type: 'email', to: [] }, { type: 'report', format: 'pdf' }] },
    },
  },

  // ─── Customer Success ──────────────────────────────────────────────────────
  {
    id: 'churn-risk-monitor',
    name: 'Churn Risk Monitor',
    category: 'customer_success',
    description: 'Daily scan of CRM signals to surface accounts at risk before they cancel.',
    icon: 'AlertCircle',
    prompt: 'Identify accounts showing disengagement signals and recommend specific CS interventions.',
    system_prompt: 'You are a Customer Success analyst specialising in churn prevention. You scan CRM data for behavioural signals — declining usage, overdue support tickets, low NPS, missed check-ins — and rank accounts by churn probability × revenue impact. For each at-risk account, recommend one specific, actionable intervention.',
    triggers: ['cron'],
    outputs: ['email', 'webhook'],
    definition: {
      name: 'Churn Risk Monitor',
      category: 'customer_success',
      trigger: { type: 'cron', cron_expression: '0 7 * * MON-FRI', timezone: 'America/New_York' },
      steps: [
        { step_id: 'ingest', agent_role: 'data_ingestor', depends_on: [], instructions: 'Pull all CRM contacts with last_activity > 14 days, support tickets > 2, or NPS < 7.', data_sources: [{ type: 'api', connector: 'hubspot' }], input_sources: [], output_keys: ['crm_data'], timeout_ms: 30000 },
        { step_id: 'analyze', agent_role: 'analyst', depends_on: ['ingest'], instructions: 'Score each at-risk account (0–1 churn probability). Rank by MRR × risk. Recommend one action per account.', input_sources: ['crm_data'], output_keys: ['risk_report'], timeout_ms: 60000, consensus: { agent_count: 3, agreement_threshold: 0.67, reconciliation: 'highest_confidence' } },
        { step_id: 'deliver', agent_role: 'delivery', depends_on: ['analyze'], instructions: 'Send daily CS digest to configured Slack webhook and email.', input_sources: ['risk_report'], output_keys: ['delivery_receipt'], timeout_ms: 15000 },
      ],
      output: { channels: [{ type: 'email', to: [] }, { type: 'webhook', url: '' }] },
    },
  },

  // ─── Product ───────────────────────────────────────────────────────────────
  {
    id: 'competitive-intel',
    name: 'Competitive Intelligence Tracker',
    category: 'product',
    description: 'Scrape competitor pricing pages and blogs weekly. Alert on changes that overlap your roadmap.',
    icon: 'Search',
    prompt: 'Monitor competitor websites for pricing changes, new features, and strategic announcements.',
    system_prompt: 'You are a product intelligence analyst. You track competitor websites, pricing pages, changelogs, and blogs for strategic signals. Classify each finding by type (pricing, feature, positioning, partnership) and rate its threat level: low / medium / high. Only alert on genuine changes — ignore routine marketing fluff.',
    triggers: ['cron'],
    outputs: ['email', 'webhook'],
    definition: {
      name: 'Competitive Intelligence Tracker',
      category: 'product',
      trigger: { type: 'cron', cron_expression: '0 8 * * MON', timezone: 'America/New_York' },
      steps: [
        { step_id: 'scrape', agent_role: 'data_ingestor', depends_on: [], instructions: 'Scrape configured competitor URLs. Extract pricing, feature lists, and blog posts from the last 7 days.', data_sources: [{ type: 'web_scrape', url: '' }], input_sources: [], output_keys: ['competitor_data'], timeout_ms: 60000 },
        { step_id: 'analyze', agent_role: 'analyst', depends_on: ['scrape'], instructions: 'Identify pricing changes, new feature announcements, and strategic shifts. Rate threat level: low/medium/high.', input_sources: ['competitor_data'], output_keys: ['intel_report'], timeout_ms: 60000 },
        { step_id: 'deliver', agent_role: 'delivery', depends_on: ['analyze'], instructions: 'Send competitive intel digest to product team.', input_sources: ['intel_report'], output_keys: ['delivery_receipt'], timeout_ms: 15000 },
      ],
      output: { channels: [{ type: 'email', to: [] }] },
    },
  },

  // ─── Sales ─────────────────────────────────────────────────────────────────
  {
    id: 'sales-pipeline-review',
    name: 'Sales Pipeline Review',
    category: 'sales',
    description: 'Weekly deal hygiene check — stale opportunities, missing next steps, and forecast roll-up.',
    icon: 'Target',
    prompt: 'Audit the sales pipeline for stale deals, flag missing next steps, and generate a weekly forecast.',
    system_prompt: 'You are a sales operations analyst. You audit CRM pipeline data for deal hygiene — stale deals, missing close dates, overdue follow-ups — and generate a weighted forecast. Be concise. Flag problems, quantify the impact, suggest next actions. Output: PIPELINE HEALTH, TOP AT-RISK DEALS, FORECAST, ACTIONS NEEDED.',
    triggers: ['cron'],
    outputs: ['email'],
    definition: {
      name: 'Sales Pipeline Review',
      category: 'sales',
      trigger: { type: 'cron', cron_expression: '0 8 * * FRI', timezone: 'America/New_York' },
      steps: [
        { step_id: 'ingest', agent_role: 'data_ingestor', depends_on: [], instructions: 'Pull all open deals from CRM. Flag deals with last_activity > 7 days or missing close date.', data_sources: [{ type: 'api', connector: 'hubspot' }], input_sources: [], output_keys: ['pipeline_data'], timeout_ms: 30000 },
        { step_id: 'analyze', agent_role: 'analyst', depends_on: ['ingest'], instructions: 'Compute weighted pipeline value, identify top 5 deals at risk, write forecast summary for sales manager.', input_sources: ['pipeline_data'], output_keys: ['pipeline_report'], timeout_ms: 60000 },
        { step_id: 'deliver', agent_role: 'delivery', depends_on: ['analyze'], instructions: 'Send pipeline review to sales manager.', input_sources: ['pipeline_report'], output_keys: ['delivery_receipt'], timeout_ms: 15000 },
      ],
      output: { channels: [{ type: 'email', to: [] }] },
    },
  },

  // ─── Operations ────────────────────────────────────────────────────────────
  {
    id: 'infra-alert',
    name: 'Infrastructure Alert Monitor',
    category: 'operations',
    description: 'Receives webhook alerts from Datadog/PagerDuty, triages severity, auto-resolves P3/P4, and escalates P1/P2 to on-call.',
    icon: 'Server',
    prompt: 'Parse the incoming alert, assess severity, and decide whether to auto-resolve or escalate to a human.',
    system_prompt: 'You are an on-call SRE assistant. You receive infrastructure alerts, parse the payload, assess severity (P1–P4), form a root-cause hypothesis, and recommend an action. P1/P2: always escalate to a human before acting. P3/P4: auto-resolve with a summary. Be concise — on-call engineers are time-pressured.',
    triggers: ['webhook'],
    outputs: ['webhook', 'email'],
    definition: {
      name: 'Infrastructure Alert Monitor',
      category: 'operations',
      trigger: { type: 'webhook' },
      steps: [
        { step_id: 'parse_alert', agent_role: 'data_ingestor', depends_on: [], instructions: 'Parse the incoming webhook payload. Extract: service name, error message, affected region, metric values, alert source.', input_sources: [], output_keys: ['alert_data'], timeout_ms: 15000 },
        { step_id: 'triage', agent_role: 'analyst', depends_on: ['parse_alert'], instructions: 'Assess alert severity P1–P4. Check runbook patterns. Output: { severity_level, summary, root_cause_hypothesis, recommended_action, auto_resolvable, confidence }', input_sources: ['alert_data'], output_keys: ['triage_result'], timeout_ms: 45000, consensus: { agent_count: 3, agreement_threshold: 0.67, reconciliation: 'highest_confidence' } },
        { step_id: 'escalate', agent_role: 'escalator', depends_on: ['triage'], instructions: 'Escalate P1/P2 to on-call for human approval. Present summary and recommended action.', input_sources: ['triage_result'], output_keys: ['escalation_result'], timeout_ms: 120000 },
        { step_id: 'resolve', agent_role: 'delivery', depends_on: ['escalate'], instructions: 'Post incident resolution to #incidents Slack channel. If rejected: page senior engineer.', input_sources: ['triage_result', 'escalation_result'], output_keys: ['resolution_receipt'], timeout_ms: 15000 },
      ],
      output: { channels: [{ type: 'webhook', url: '' }, { type: 'email', to: [] }] },
    },
  },

  // ─── New: AI-native agents ─────────────────────────────────────────────────
  {
    id: 'support-agent',
    name: 'Support Agent',
    category: 'operations',
    description: 'Answers support questions from your docs (llms.txt). Escalates unanswered questions via email.',
    icon: 'MessageSquare',
    prompt: 'Answer the user question from the documentation. If the answer is not in the docs, escalate via email.',
    system_prompt: 'You are Support Agent, a docs-powered support agent. When a user asks a question:\n1. Search your knowledge base (llms.txt or provided docs URL) for a precise answer.\n2. If you find it: answer clearly and cite the relevant section.\n3. If the docs do not cover the question: send an escalation email via Resend to the support team with the original question and context.\nNever make up answers. Always prefer a clear "I don\'t know, escalating" over a wrong answer.',
    mcp_servers: [
      { name: 'resend', label: 'Resend', url: 'https://mcp.resend.com/mcp', description: 'Send escalation emails' },
    ],
    triggers: ['manual', 'webhook'],
    outputs: ['email', 'webhook'],
    definition: {
      name: 'Support Agent',
      category: 'operations',
      trigger: { type: 'webhook' },
      steps: [
        { step_id: 'fetch_docs', agent_role: 'data_ingestor', depends_on: [], instructions: 'Fetch the docs URL (llms.txt or configured endpoint). Parse into searchable sections.', data_sources: [{ type: 'web_scrape', url: '' }], input_sources: [], output_keys: ['docs_content'], timeout_ms: 20000 },
        { step_id: 'answer', agent_role: 'analyst', depends_on: ['fetch_docs'], instructions: 'Search docs for the user question. If found: return answer with source section. If not found: set escalate=true.', input_sources: ['docs_content'], output_keys: ['answer_result'], timeout_ms: 30000 },
        { step_id: 'deliver', agent_role: 'delivery', depends_on: ['answer'], instructions: 'If answer found: return it. If escalate=true: send email via Resend to support team with question and context.', input_sources: ['answer_result'], output_keys: ['delivery_receipt'], timeout_ms: 15000 },
      ],
      output: { channels: [{ type: 'email', to: [] }, { type: 'webhook', url: '' }] },
    },
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    category: 'product',
    description: 'Load and explore datasets, build cohort and funnel reports, answer questions from your Amplitude data.',
    icon: 'BarChart2',
    prompt: 'Analyse the provided dataset or Amplitude event data and answer the question.',
    system_prompt: 'You are a data analyst. Given a dataset (file path, URL, or query) and a question:\n1. Load the data and print its shape, column names, dtypes, and a small sample. Always look before you compute.\n2. Clean obvious issues — nulls, duplicates, type mismatches — and note what you changed.\n3. Answer the question with code. Prefer pandas for tabular work, matplotlib for charts.\n4. For product-analytics questions, query Amplitude directly — event funnels, retention cohorts, property breakdowns.\n5. Save any charts to /mnt/session/outputs/ and summarise findings in plain language, including caveats (sample size, missing data, correlation-vs-causation).\nDefault to simple, readable analysis over clever one-liners.',
    mcp_servers: [
      { name: 'amplitude', label: 'Amplitude', url: 'https://mcp.amplitude.com/mcp', description: 'Event funnels, cohorts, retention' },
    ],
    triggers: ['manual', 'webhook'],
    outputs: ['report', 'webhook'],
    definition: {
      name: 'Data Analyst',
      category: 'product',
      trigger: { type: 'manual' },
      steps: [
        { step_id: 'load_data', agent_role: 'data_ingestor', depends_on: [], instructions: 'Load the dataset or query Amplitude for the requested event data. Print shape, columns, sample.', data_sources: [{ type: 'api', connector: 'amplitude' }], input_sources: [], output_keys: ['raw_data'], timeout_ms: 45000 },
        { step_id: 'analyze', agent_role: 'analyst', depends_on: ['load_data'], instructions: 'Answer the user question. Run funnels, cohorts, or statistical analysis as needed. Generate charts and save to /outputs/.', input_sources: ['raw_data'], output_keys: ['analysis_result'], timeout_ms: 120000 },
        { step_id: 'deliver', agent_role: 'delivery', depends_on: ['analyze'], instructions: 'Return the analysis summary with key findings, caveats, and links to any generated charts.', input_sources: ['analysis_result'], output_keys: ['delivery_receipt'], timeout_ms: 15000 },
      ],
      output: { channels: [{ type: 'report', format: 'markdown' }] },
    },
  },
  {
    id: 'lead-research',
    name: 'Lead Research Agent',
    category: 'sales',
    description: 'Research a person by email or name, qualify them as a lead, and send a Slack alert if interesting.',
    icon: 'UserSearch',
    prompt: 'Research this lead and qualify whether they are worth pursuing.',
    system_prompt: 'You are a lead research agent. You investigate people by email or name and qualify them as leads.\n\nWORKFLOW:\n1. Use web_search and web_fetch for research. Use Exa for richer people/company searches.\n2. Search queries: email domain, name + company, name LinkedIn, company about page.\n3. Fetch promising URLs (LinkedIn, company site, GitHub) to gather details.\n4. Qualify the lead: consider company domain, technical role, startup/tech company, recent AI/agent deployments.\n5. If interesting: post a Slack alert with name, role, company, why interesting, and links. If not: summarise only, do NOT send Slack.\n\nOUTPUT: Brief research summary. Only send Slack when you find a genuinely interesting lead.',
    mcp_servers: [
      { name: 'exa', label: 'Exa', url: 'https://mcp.exa.ai/mcp', description: 'Web search and people research' },
      { name: 'slack', label: 'Slack', url: 'https://mcp.slack.com/mcp', description: 'Post lead alerts to channel' },
    ],
    triggers: ['manual', 'webhook'],
    outputs: ['webhook'],
    definition: {
      name: 'Lead Research Agent',
      category: 'sales',
      trigger: { type: 'manual' },
      steps: [
        { step_id: 'research', agent_role: 'data_ingestor', depends_on: [], instructions: 'Search the web and Exa for the lead. Query: email domain, name + company, LinkedIn. Fetch top 3 URLs.', data_sources: [{ type: 'web_scrape', url: '' }], input_sources: [], output_keys: ['research_data'], timeout_ms: 60000 },
        { step_id: 'qualify', agent_role: 'analyst', depends_on: ['research'], instructions: 'Score the lead: technical role, company size, AI/agent interest, decision-maker status. Output: { score, qualified, company, role, why_interesting, links }', input_sources: ['research_data'], output_keys: ['qualification'], timeout_ms: 45000 },
        { step_id: 'deliver', agent_role: 'delivery', depends_on: ['qualify'], instructions: 'If qualified=true: post Slack alert with name, role, company, reasoning, and links. If false: return summary only, no Slack.', input_sources: ['qualification'], output_keys: ['delivery_receipt'], timeout_ms: 15000 },
      ],
      output: { channels: [{ type: 'webhook', url: '' }] },
    },
  },

  // ─── Custom ────────────────────────────────────────────────────────────────
  {
    id: 'custom',
    name: 'Custom Workflow',
    category: 'custom',
    description: 'Start from scratch. Define your own agents, tools, and delivery channels.',
    icon: 'Wand2',
    prompt: '',
    system_prompt: 'You are a helpful AI agent. Complete the task given to you accurately and concisely.',
    triggers: ['manual', 'cron', 'webhook'],
    outputs: ['email', 'webhook', 'pdf'],
    definition: {
      name: 'Custom Workflow',
      category: 'custom',
      trigger: { type: 'manual' },
      steps: [],
      output: { channels: [] },
    },
  },
]

export function getTemplateById(id: string) {
  return WORKFLOW_TEMPLATES.find(t => t.id === id)
}

export const TEMPLATE_CATEGORIES = [
  { value: 'all',               label: 'All' },
  { value: 'finance_executive', label: 'Finance' },
  { value: 'customer_success',  label: 'Customer Success' },
  { value: 'sales',             label: 'Sales' },
  { value: 'marketing',         label: 'Marketing' },
  { value: 'operations',        label: 'Operations' },
  { value: 'product',           label: 'Product' },
  { value: 'custom',            label: 'Custom' },
] as const
