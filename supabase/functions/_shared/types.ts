export type AgentRole =
  | 'data_ingestor'
  | 'analyst'
  | 'researcher'
  | 'critic'
  | 'synthesizer'
  | 'eval'
  | 'delivery'
  | 'orchestrator'
  | 'watcher'
  | 'escalator'

export type AgentEventType =
  | 'START_WORKFLOW'
  | 'TASK_ASSIGNED'
  | 'TASK_COMPLETE'
  | 'DATA_READY'
  | 'ANALYSIS_READY'
  | 'RESEARCH_COMPLETE'
  | 'EVAL_PASS'
  | 'EVAL_FAIL_RETRY'
  | 'DELIVERY_SENT'
  | 'WORKFLOW_COMPLETE'
  | 'AGENT_ERROR'
  | 'CONSENSUS_START'
  | 'CONSENSUS_VOTE'
  | 'CONSENSUS_RESOLVED'
  | 'CRITIQUE_REQUESTED'
  | 'CRITIQUE_FEEDBACK'
  | 'CRITIQUE_APPROVED'
  | 'ESCALATION_REQUESTED'
  | 'HUMAN_APPROVED'
  | 'HUMAN_REJECTED'

export interface AgentEvent {
  id: string
  run_id: string
  event_type: AgentEventType
  source_agent: AgentRole
  target_agent?: AgentRole
  step_id?: string
  payload: Record<string, unknown>
  created_at: string
  correlation_id?: string
}

export type DataSourceType = 'http' | 'web_scrape' | 'google_sheets' | 'webhook' | 'file'

export interface DataSource {
  type: DataSourceType
  label?: string          // human-readable name shown in UI
  url?: string
  method?: 'GET' | 'POST' | 'PUT'
  headers?: Record<string, string>
  bearer_token?: string
  body?: string           // JSON body for POST requests
  spreadsheet_id?: string
  sheet_name?: string
}

export interface ConsensusConfig {
  agent_count: number
  agreement_threshold: number
  reconciliation: 'majority' | 'highest_confidence' | 'union'
}

export interface WorkflowStep {
  step_id: string
  agent_role: AgentRole
  depends_on: string[]
  instructions: string
  data_sources?: DataSource[]
  input_sources: string[]
  output_keys: string[]
  timeout_ms: number
  consensus?: ConsensusConfig
  retry_target?: string
  max_retries?: number
  critique_loop?: {
    max_rounds: number
    critic_instructions?: string
  }
}

export type DeliveryChannel =
  | { type: 'email'; to: string[]; subject_template?: string }
  | { type: 'webhook'; url: string; headers?: Record<string, string> }
  | { type: 'report'; format: 'pdf' | 'xlsx' | 'markdown' }
  | { type: 'telegram'; chat_id: string }

export interface McpServer {
  name: string
  label: string
  url: string
  description: string
  enabled: boolean
}

export interface WorkflowDefinition {
  id: string
  name: string
  category: string
  trigger: {
    type: string
    cron_expression?: string
    timezone?: string
  }
  steps: WorkflowStep[]
  output: { channels: DeliveryChannel[] }
  system_prompt?: string
  mcp_servers?: McpServer[]
  webhook_secret?: string
}

export interface EvalResult {
  pass: boolean
  overall_score?: number
  scores?: { completeness: number; specificity: number; actionability: number; tone: number }
  failed_sections?: string[]
  feedback?: string
  attempts_taken?: number
}
