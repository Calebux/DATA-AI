import type { WorkflowTemplate } from '@/types'

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ─── Finance ──────────────────────────────────────────────────────────────
  {
    id: 'weekly-saas-intel',
    name: 'Weekly SaaS Intelligence Report',
    category: 'finance_executive',
    description: 'Pull subscription + CRM data, score churn risk, flag competitive threats, deliver CEO briefing by 8AM Monday.',
    icon: 'TrendingUp',
    prompt: 'Analyse MRR changes, identify at-risk accounts, and summarise competitive signals for the week.',
    system_prompt: `You are a Senior SaaS Financial Analyst. Your role is to formulate executive briefings from raw financial data.

STRICT INSTRUCTIONS:
1. DATA VALIDATION: Always check the shape and validity of the incoming data. If data is null or empty, IMMEDIATELY halt the analysis and return a JSON error payload explaining the missing data source.
2. PRECISION: All financial figures (MRR, ARR) must be calculated exactly. Do not estimate.
3. CONTEXT: Every number provided in the summary must have a relative context (e.g. "MRR is $10k, up 5% WoW").
4. FORMAT: You must strictly adhere to the requested schema. Never return conversational filler text outside of the JSON payload.`,
    triggers: ['cron'],
    outputs: ['email', 'webhook'],
    definition: {
      name: 'Weekly SaaS Intelligence Report',
      category: 'finance_executive',
      trigger: { type: 'cron', cron_expression: '0 8 * * MON', timezone: 'America/New_York' },
      steps: [
        {
          step_id: 'ingest_revenue',
          agent_role: 'data_ingestor',
          depends_on: [],
          instructions: 'Fetch subscription/revenue data from the configured API. Return the raw JSON response.',
          data_sources: [{ type: 'http', label: 'Revenue API', url: '', bearer_token: '' }],
          input_sources: [],
          output_keys: ['revenue_data'],
          timeout_ms: 30000,
        },
        {
          step_id: 'ingest_crm',
          agent_role: 'data_ingestor',
          depends_on: [],
          instructions: 'Fetch CRM contacts, deals, and activity data from the configured API. Return the raw JSON response.',
          data_sources: [{ type: 'http', label: 'CRM API', url: '', bearer_token: '' }],
          input_sources: [],
          output_keys: ['crm_data'],
          timeout_ms: 30000,
        },
        {
          step_id: 'analyze_revenue',
          agent_role: 'analyst',
          depends_on: ['ingest_revenue'],
          instructions: 'Calculate WoW MRR change, identify primary driver, flag anomalies. YOU MUST RETURN EXACTLY THIS JSON SCHEMA WITH NO EXTRA TEXT: { "summary": "string", "mrr_change_pct": "number", "primary_driver": "string", "anomalies": ["string"], "arr_implied": "number", "risk_level": "LOW|MED|HIGH" }',
          input_sources: ['revenue_data'],
          output_keys: ['revenue_analysis'],
          timeout_ms: 60000,
        },
        {
          step_id: 'analyze_churn_risk',
          agent_role: 'analyst',
          depends_on: ['ingest_revenue', 'ingest_crm'],
          instructions: 'Score churn probability [0.0-1.0] for flagged accounts. Rank top 5 by (MRR * probability). MUST RETURN JSON SCHEMA: { "at_risk_accounts": [{ "id": "string", "mrr_impact": "number", "probability": "number", "reason": "string" }], "total_revenue_at_risk": "number", "confidence": "number" }',
          input_sources: ['revenue_data', 'crm_data'],
          output_keys: ['churn_analysis'],
          timeout_ms: 90000,
          consensus: { agent_count: 3, agreement_threshold: 0.67, reconciliation: 'highest_confidence' },
        },
        {
          step_id: 'synthesize',
          agent_role: 'analyst',
          depends_on: ['analyze_revenue', 'analyze_churn_risk'],
          instructions: 'Write the CEO briefing combining revenue analysis and churn risk. Structure strictly with markdown headers: # HEADLINE \n ## REVENUE \n ## CUSTOMERS AT RISK \n ## RECOMMENDED ACTIONS. Be direct, no opening greetings.',
          input_sources: ['revenue_analysis', 'churn_analysis'],
          output_keys: ['synthesized_report'],
          timeout_ms: 60000,
        },
        {
          step_id: 'eval_report',
          agent_role: 'eval',
          depends_on: ['synthesize'],
          instructions: 'Score completeness, specificity, actionability, tone on a 0.0 to 1.0 scale. If ANY score < 0.75, FAIL the evaluation and return specific feedback on what is missing.',
          input_sources: ['synthesized_report'],
          output_keys: ['eval_result'],
          max_retries: 2,
          timeout_ms: 30000,
        },
        {
          step_id: 'deliver',
          agent_role: 'delivery',
          depends_on: ['eval_report'],
          instructions: 'Format the synthesized_report as an HTML email and dispatch.',
          input_sources: ['synthesized_report', 'eval_result'],
          output_keys: ['delivery_receipt'],
          timeout_ms: 15000,
        },
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
        {
          step_id: 'ingest_financials',
          agent_role: 'data_ingestor',
          depends_on: [],
          instructions: 'Fetch revenue data from the configured API endpoint. Expect at least 3 months of historical data. Return the raw JSON response.',
          data_sources: [{ type: 'http', label: 'Revenue API', url: '', bearer_token: '' }],
          input_sources: [],
          output_keys: ['financial_data'],
          timeout_ms: 45000,
        },
        {
          step_id: 'analyze',
          agent_role: 'analyst',
          depends_on: ['ingest_financials'],
          instructions: 'Compute MoM and YoY growth rates, identify revenue cohorts, flag anomalies, write board summary.',
          input_sources: ['financial_data'],
          output_keys: ['revenue_report'],
          timeout_ms: 90000,
        },
        {
          step_id: 'eval',
          agent_role: 'eval',
          depends_on: ['analyze'],
          instructions: 'Verify all figures are cited with exact numbers. Score accuracy and board-readiness.',
          input_sources: ['revenue_report'],
          output_keys: ['eval_result'],
          max_retries: 1,
          timeout_ms: 30000,
        },
        {
          step_id: 'deliver',
          agent_role: 'delivery',
          depends_on: ['eval'],
          instructions: 'Send as formatted email + attach PDF to configured recipients.',
          input_sources: ['revenue_report', 'eval_result'],
          output_keys: ['delivery_receipt'],
          timeout_ms: 15000,
        },
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
    system_prompt: `You are a Customer Success Intelligence Analyst. You scan CRM metrics for covert behavioral signals indicating high churn risk.

INSTRUCTIONS:
1. Identify primary risk factors: declining product usage, unresolved P1 support tickets, ignored check-in emails, or low NPS scores.
2. Weight factors by the velocity of decay (e.g. usage dropped 50% in 1 week is worse than 20% in 1 month).
3. Always suggest exactly ONE concrete action the Account Manager can take today to save the account.`,
    triggers: ['cron'],
    outputs: ['email', 'webhook'],
    definition: {
      name: 'Churn Risk Monitor',
      category: 'customer_success',
      trigger: { type: 'cron', cron_expression: '0 7 * * MON-FRI', timezone: 'America/New_York' },
      steps: [
        {
          step_id: 'ingest',
          agent_role: 'data_ingestor',
          depends_on: [],
          instructions: 'Fetch customer/contact data from the configured CRM API endpoint. Return the raw JSON response.',
          data_sources: [{ type: 'http', label: 'CRM API', url: '', bearer_token: '' }],
          input_sources: [],
          output_keys: ['crm_data'],
          timeout_ms: 30000,
        },
        {
          step_id: 'analyze',
          agent_role: 'analyst',
          depends_on: ['ingest'],
          instructions: 'Score each account on a 0.0-1.0 risk scale. Multiply risk by MRR to get At-Risk Value. Output MUST be an array of objects: [{ account_id, name, risk_score, at_risk_value, recommended_action }]. Sort descending by at_risk_value.',
          input_sources: ['crm_data'],
          output_keys: ['risk_report'],
          timeout_ms: 60000,
          consensus: { agent_count: 3, agreement_threshold: 0.67, reconciliation: 'highest_confidence' },
        },
        {
          step_id: 'deliver',
          agent_role: 'delivery',
          depends_on: ['analyze'],
          instructions: 'Parse the risk_report array. If empty, halt. Otherwise, format into a styled HTML table and post to configured webhook.',
          input_sources: ['risk_report'],
          output_keys: ['delivery_receipt'],
          timeout_ms: 15000,
        },
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
        {
          step_id: 'scrape',
          agent_role: 'data_ingestor',
          depends_on: [],
          instructions: 'Scrape the configured competitor URL. Extract pricing, feature lists, and blog posts.',
          data_sources: [{ type: 'web_scrape', label: 'Competitor Site', url: '' }],
          input_sources: [],
          output_keys: ['competitor_data'],
          timeout_ms: 60000,
        },
        {
          step_id: 'analyze',
          agent_role: 'analyst',
          depends_on: ['scrape'],
          instructions: 'Identify pricing changes, new feature announcements, and strategic shifts. Rate threat level: low/medium/high.',
          input_sources: ['competitor_data'],
          output_keys: ['intel_report'],
          timeout_ms: 60000,
        },
        {
          step_id: 'deliver',
          agent_role: 'delivery',
          depends_on: ['analyze'],
          instructions: 'Send competitive intel digest to product team.',
          input_sources: ['intel_report'],
          output_keys: ['delivery_receipt'],
          timeout_ms: 15000,
        },
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
        {
          step_id: 'ingest',
          agent_role: 'data_ingestor',
          depends_on: [],
          instructions: 'Fetch pipeline/deals data from the configured CRM API endpoint. Return the raw JSON response.',
          data_sources: [{ type: 'http', label: 'CRM / Pipeline API', url: '', bearer_token: '' }],
          input_sources: [],
          output_keys: ['pipeline_data'],
          timeout_ms: 30000,
        },
        {
          step_id: 'analyze',
          agent_role: 'analyst',
          depends_on: ['ingest'],
          instructions: 'Compute weighted pipeline value, identify top 5 deals at risk, write forecast summary for sales manager.',
          input_sources: ['pipeline_data'],
          output_keys: ['pipeline_report'],
          timeout_ms: 60000,
        },
        {
          step_id: 'deliver',
          agent_role: 'delivery',
          depends_on: ['analyze'],
          instructions: 'Send pipeline review to sales manager.',
          input_sources: ['pipeline_report'],
          output_keys: ['delivery_receipt'],
          timeout_ms: 15000,
        },
      ],
      output: { channels: [{ type: 'email', to: [] }] },
    },
  },

  // ─── Operations ────────────────────────────────────────────────────────────
  {
    id: 'infra-alert',
    name: 'Infrastructure Alert Monitor',
    category: 'operations',
    description: 'Receives webhook alerts from monitoring tools, triages severity, auto-resolves P3/P4, and escalates P1/P2 to on-call.',
    icon: 'Server',
    prompt: 'Parse the incoming alert, assess severity, and decide whether to auto-resolve or escalate to a human.',
    system_prompt: `You are an L2 Site Reliability Engineer answering automated infrastructure alerts.

ROUTING LOGIC:
1. P1/P2 SEVERITY: Any alert involving database degradation, node failure on primary clusters, or API 5xx spikes > 5%. YOU MUST route to ESCALATOR.
2. P3/P4 SEVERITY: High memory usage, background worker delay, single-pod restarts. You MUST route to AUTO_RESOLVE.

Never assume root causes without metric evidence. If unsure, default to P2 escalation.`,
    triggers: ['webhook'],
    outputs: ['webhook', 'email'],
    definition: {
      name: 'Infrastructure Alert Monitor',
      category: 'operations',
      trigger: { type: 'webhook' },
      steps: [
        {
          step_id: 'parse_alert',
          agent_role: 'data_ingestor',
          depends_on: [],
          instructions: 'Extract key identifiers from the payload: service_name, error_code, environment, memory_usage, cpu_usage. Return cleaned JSON.',
          input_sources: [],
          output_keys: ['alert_data'],
          timeout_ms: 15000,
        },
        {
          step_id: 'triage',
          agent_role: 'analyst',
          depends_on: ['parse_alert'],
          instructions: 'Assess severity (P1-P4). Construct root cause hypothesis. MUST OUTPUT JSON: { "severity_level": "P1|P2|P3|P4", "summary": "string", "root_cause": "string", "requires_escalation": boolean, "recommended_fix": "string", "confidence": "number" }. Set requires_escalation = true ONLY for P1/P2.',
          input_sources: ['alert_data'],
          output_keys: ['triage_result'],
          timeout_ms: 45000,
          consensus: { agent_count: 3, agreement_threshold: 0.67, reconciliation: 'highest_confidence' },
        },
        {
          step_id: 'escalate',
          agent_role: 'escalator',
          depends_on: ['triage'],
          instructions: 'If triage_result.requires_escalation is true: Issue ESCALATION_REQUESTED event to the human Inbox and pause. Provide the human with the summary and recommended_fix.',
          input_sources: ['triage_result'],
          output_keys: ['escalation_result'],
          timeout_ms: 120000,
        },
        {
          step_id: 'resolve',
          agent_role: 'delivery',
          depends_on: ['escalate'],
          instructions: 'Post incident resolution to configured webhook. Note if it was auto-resolved or human-approved.',
          input_sources: ['triage_result', 'escalation_result'],
          output_keys: ['resolution_receipt'],
          timeout_ms: 15000,
        },
      ],
      output: { channels: [{ type: 'webhook', url: '' }, { type: 'email', to: [] }] },
    },
  },

  // ─── AI-native agents ──────────────────────────────────────────────────────
  {
    id: 'support-agent',
    name: 'Support Agent',
    category: 'operations',
    description: 'Answers support questions from your docs URL. Escalates unanswered questions via email.',
    icon: 'MessageSquare',
    prompt: 'Answer the user question from the documentation. If the answer is not in the docs, escalate via email.',
    system_prompt: `You are a Tier 1 Customer Support Agent. Your sole source of truth is the provided Knowledge Base documentation.

LITERAL ANSWERING RULES:
1. ONLY answer using facts explicitly stated in the docs.
2. If the user asks a question not covered by the docs, YOU MUST NOT GUESS. You must set 'escalate_required': true.
3. Keep answers concise, empathetic, and in markdown.`,
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
        {
          step_id: 'fetch_docs',
          agent_role: 'data_ingestor',
          depends_on: [],
          instructions: 'Fetch the docs URL and extract plain text. Store in memory.',
          data_sources: [{ type: 'web_scrape', label: 'Docs URL', url: '' }],
          input_sources: [],
          output_keys: ['docs_content'],
          timeout_ms: 20000,
        },
        {
          step_id: 'answer',
          agent_role: 'analyst',
          depends_on: ['fetch_docs'],
          instructions: 'Search docs for question. MUST OUTPUT JSON: { "answer_found": boolean, "escalate_required": boolean, "response_text": "string", "source_citation": "string" }',
          input_sources: ['docs_content'],
          output_keys: ['answer_result'],
          timeout_ms: 30000,
        },
        {
          step_id: 'deliver',
          agent_role: 'delivery',
          depends_on: ['answer'],
          instructions: 'If escalate_required: send email via Resend to support tier 2. If false: return response_text to the user chat webhook.',
          input_sources: ['answer_result'],
          output_keys: ['delivery_receipt'],
          timeout_ms: 15000,
        },
      ],
      output: { channels: [{ type: 'email', to: [] }, { type: 'webhook', url: '' }] },
    },
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    category: 'product',
    description: 'Point at any CSV or JSON URL. Agents clean, analyse, and return an insight report with trends and caveats.',
    icon: 'BarChart2',
    prompt: 'Analyse the provided dataset and surface the most important insights.',
    system_prompt: `You are a Principal Data Scientist. You analyze datasets with absolute statistical rigor.

METHODOLOGY:
1. INGESTION: Load data, print shapes, identify dtypes and nulls.
2. CLEANING: Explicitly declare how missing data or outliers were handled before analysis.
3. ANALYSIS: Apply proper statistical logic. Distinguish correlation from causation.
4. SYNTHESIS: Return actionable insights. Provide confidence intervals where applicable.`,
    triggers: ['manual', 'webhook'],
    outputs: ['report'],
    definition: {
      name: 'Data Analyst',
      category: 'product',
      trigger: { type: 'manual' },
      steps: [
        {
          step_id: 'load_data',
          agent_role: 'data_ingestor',
          depends_on: [],
          instructions: 'Fetch the data from the configured URL. Accept CSV, JSON, or plain text. Return the raw payload.',
          data_sources: [{ type: 'http', label: 'Data File URL', url: '' }],
          input_sources: [],
          output_keys: ['raw_data'],
          timeout_ms: 45000,
        },
        {
          step_id: 'analyze',
          agent_role: 'analyst',
          depends_on: ['load_data'],
          instructions: 'Parse the raw_data as CSV or JSON. Perform descriptive statistics. Group by relevant dimensions. OUTPUT MUST BE JSON: { "insights": [{ "metric": "string", "value": "number|string", "trend": "string", "significance": "number" }], "summary_markdown": "string", "caveats": ["string"] }',
          input_sources: ['raw_data'],
          output_keys: ['analysis_result'],
          timeout_ms: 120000,
        },
        {
          step_id: 'deliver',
          agent_role: 'delivery',
          depends_on: ['analyze'],
          instructions: 'Publish the summary_markdown as a formatted Markdown report document.',
          input_sources: ['analysis_result'],
          output_keys: ['delivery_receipt'],
          timeout_ms: 15000,
        },
      ],
      output: { channels: [{ type: 'report', format: 'markdown' }] },
    },
  },
  {
    id: 'lead-research',
    name: 'Lead Research Agent',
    category: 'sales',
    description: 'Research a person by email or name, qualify them as a lead, and send a webhook alert if interesting.',
    icon: 'UserSearch',
    prompt: 'Research this lead and qualify whether they are worth pursuing.',
    system_prompt: 'You are a lead research agent. You investigate people by email or name and qualify them as leads.\n\nWORKFLOW:\n1. Use web_search and web_fetch for research.\n2. Search queries: email domain, name + company, name LinkedIn, company about page.\n3. Fetch promising URLs (LinkedIn, company site, GitHub) to gather details.\n4. Qualify the lead: consider company domain, technical role, startup/tech company, recent AI/agent deployments.\n5. If interesting: post a webhook alert with name, role, company, why interesting, and links. If not: summarise only.\n\nOUTPUT: Brief research summary.',
    mcp_servers: [
      { name: 'exa', label: 'Exa', url: 'https://mcp.exa.ai/mcp', description: 'Web search and people research' },
    ],
    triggers: ['manual', 'webhook'],
    outputs: ['webhook'],
    definition: {
      name: 'Lead Research Agent',
      category: 'sales',
      trigger: { type: 'manual' },
      steps: [
        {
          step_id: 'research',
          agent_role: 'data_ingestor',
          depends_on: [],
          instructions: 'Scrape the provided URL for lead information. Extract professional details, company info, and any relevant signals.',
          data_sources: [{ type: 'web_scrape', label: 'Lead Profile URL', url: '' }],
          input_sources: [],
          output_keys: ['research_data'],
          timeout_ms: 60000,
        },
        {
          step_id: 'qualify',
          agent_role: 'analyst',
          depends_on: ['research'],
          instructions: 'Score the lead: technical role, company size, AI/agent interest, decision-maker status. Output: { "score": 0, "qualified": true, "company": "", "role": "", "why_interesting": "", "links": [] }',
          input_sources: ['research_data'],
          output_keys: ['qualification'],
          timeout_ms: 45000,
        },
        {
          step_id: 'deliver',
          agent_role: 'delivery',
          depends_on: ['qualify'],
          instructions: 'If qualified=true: post webhook alert with name, role, company, reasoning, and links. If false: return summary only.',
          input_sources: ['qualification'],
          output_keys: ['delivery_receipt'],
          timeout_ms: 15000,
        },
      ],
      output: { channels: [{ type: 'webhook', url: '' }] },
    },
  },

  // ─── Researcher + Critique loop templates ─────────────────────────────────
  {
    id: 'market-research',
    name: 'Deep Market Research',
    category: 'marketing',
    description: 'Give it a topic. A researcher agent scours the web, an analyst synthesises findings, and a critic challenges the conclusions until they hold up.',
    icon: 'Search',
    prompt: 'Research the topic deeply, synthesise findings, and pressure-test conclusions before delivery.',
    system_prompt: `You are a senior market analyst producing board-ready research briefs.

RULES:
1. Every claim must be supported by a cited source.
2. Distinguish between primary data (from sources) and inference.
3. Surface contradictions in the evidence — do not smooth them over.
4. Output must be structured JSON — no prose preamble.`,
    triggers: ['manual', 'webhook'],
    outputs: ['report', 'email'],
    definition: {
      name: 'Deep Market Research',
      category: 'marketing',
      trigger: { type: 'manual' },
      steps: [
        {
          step_id: 'research',
          agent_role: 'researcher',
          depends_on: [],
          instructions: 'Search the web for information on the topic from trigger_context.query or trigger_context.topic. Find recent news, expert opinions, market data, and competitive signals. Return structured findings with source citations. OUTPUT JSON: { "findings": [{ "insight": "string", "source": "string", "url": "string", "confidence": 0.0-1.0 }], "key_themes": ["string"], "data_gaps": ["string"] }',
          input_sources: [],
          output_keys: ['research_findings'],
          timeout_ms: 120000,
        },
        {
          step_id: 'analyse',
          agent_role: 'analyst',
          depends_on: ['research'],
          instructions: 'Synthesise the research findings into a strategic brief. Identify the 3-5 most important insights, surface risks and opportunities. OUTPUT JSON: { "headline": "string", "executive_summary": "string", "key_insights": [{ "insight": "string", "implication": "string", "confidence": "number" }], "risks": ["string"], "opportunities": ["string"], "recommended_actions": ["string"] }',
          input_sources: ['research_findings'],
          output_keys: ['strategic_brief'],
          timeout_ms: 90000,
          critique_loop: {
            max_rounds: 2,
            critic_instructions: 'Check that every insight is backed by specific evidence from the research findings. Flag any unsupported generalisations, missing counter-arguments, or weak confidence claims.',
          },
        },
        {
          step_id: 'eval_brief',
          agent_role: 'eval',
          depends_on: ['analyse'],
          instructions: 'Score the brief on: completeness (are all key themes covered?), specificity (are insights concrete?), actionability (can a decision-maker act on this?), credibility (are claims backed by evidence?). Fail if any score < 0.75.',
          input_sources: ['strategic_brief'],
          output_keys: ['eval_result'],
          timeout_ms: 45000,
        },
        {
          step_id: 'deliver',
          agent_role: 'delivery',
          depends_on: ['eval_brief'],
          instructions: 'Format and deliver the strategic brief.',
          input_sources: ['strategic_brief', 'eval_result'],
          output_keys: ['delivery_receipt'],
          timeout_ms: 15000,
        },
      ],
      output: { channels: [{ type: 'report', format: 'markdown' }, { type: 'email', to: [] }] },
    },
  },
  {
    id: 'competitive-monitor',
    name: 'Competitor Intelligence Monitor',
    category: 'sales',
    description: 'Tracks competitor activity across the web. Two researcher agents work in parallel on different angles, a critic stress-tests the brief, then delivers a weekly intel update.',
    icon: 'Target',
    prompt: 'Monitor competitor activity and surface strategic signals worth acting on.',
    system_prompt: `You are a competitive intelligence analyst. You track competitor moves and extract strategic signals.

FOCUS AREAS: pricing changes, product launches, hiring signals, funding news, customer reviews, partnership announcements.
RULES:
1. Separate facts from speculation.
2. Rate each signal: HIGH / MED / LOW strategic importance.
3. Always note the recency of each source.
4. Return strict JSON — no extra text.`,
    triggers: ['cron', 'manual'],
    outputs: ['email', 'webhook'],
    definition: {
      name: 'Competitor Intelligence Monitor',
      category: 'sales',
      trigger: { type: 'cron', cron_expression: '0 7 * * MON', timezone: 'America/New_York' },
      steps: [
        {
          step_id: 'research_product',
          agent_role: 'researcher',
          depends_on: [],
          instructions: 'Search for recent news about competitor product launches, feature releases, and pricing changes. Focus on the last 7 days. OUTPUT JSON: { "signals": [{ "type": "product|pricing|hiring|funding|partnership|review", "description": "string", "source": "string", "url": "string", "date": "string", "importance": "HIGH|MED|LOW" }] }',
          input_sources: [],
          output_keys: ['product_signals'],
          timeout_ms: 120000,
        },
        {
          step_id: 'research_market',
          agent_role: 'researcher',
          depends_on: [],
          instructions: 'Search for recent news about competitor hiring trends, funding rounds, customer wins/losses, and market positioning. Focus on the last 7 days. OUTPUT JSON: { "signals": [{ "type": "product|pricing|hiring|funding|partnership|review", "description": "string", "source": "string", "url": "string", "date": "string", "importance": "HIGH|MED|LOW" }] }',
          input_sources: [],
          output_keys: ['market_signals'],
          timeout_ms: 120000,
        },
        {
          step_id: 'synthesise_intel',
          agent_role: 'analyst',
          depends_on: ['research_product', 'research_market'],
          instructions: 'Merge product_signals and market_signals. De-duplicate. Rank all signals by importance. Write a strategic BLUF summary. OUTPUT JSON: { "headline": "string", "bluf": "string (Bottom Line Up Front — 2-3 sentences)", "top_signals": [{ "type": "string", "description": "string", "importance": "HIGH|MED|LOW", "source": "string", "recommended_response": "string" }], "watch_list": ["things to monitor next week"] }',
          input_sources: ['product_signals', 'market_signals'],
          output_keys: ['intel_brief'],
          timeout_ms: 90000,
          critique_loop: {
            max_rounds: 2,
            critic_instructions: 'Verify the BLUF is genuinely actionable. Check that HIGH importance signals are truly significant and not routine noise. Flag if any critical signals from the raw research were dropped in the synthesis.',
          },
        },
        {
          step_id: 'deliver',
          agent_role: 'delivery',
          depends_on: ['synthesise_intel'],
          instructions: 'Send the intelligence brief via email and webhook.',
          input_sources: ['intel_brief'],
          output_keys: ['delivery_receipt'],
          timeout_ms: 15000,
        },
      ],
      output: { channels: [{ type: 'email', to: [] }, { type: 'webhook', url: '' }] },
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
