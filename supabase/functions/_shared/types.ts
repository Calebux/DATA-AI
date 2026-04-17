export type AgentRole =
  | 'data_ingestor'
  | 'analyst'
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
  | 'EVAL_PASS'
  | 'EVAL_FAIL_RETRY'
  | 'DELIVERY_SENT'
  | 'WORKFLOW_COMPLETE'
  | 'AGENT_ERROR'
  | 'CONSENSUS_START'
  | 'CONSENSUS_VOTE'
  | 'CONSENSUS_RESOLVED'
  | 'ESCALATION_REQUESTED'
  | 'HUMAN_APPROVED'
  | 'HUMAN_REJECTED'

export interface AgentEvent {
  event_id: string
  workflow_run_id: string
  event_type: AgentEventType
  source_agent: AgentRole
  target_agent?: AgentRole
  step_id?: string
  payload: Record<string, unknown>
  timestamp: string
  correlation_id?: string
}

export type DataSourceType = 'api' | 'web_scrape' | 'google_sheets' | 'webhook' | 'file'

export interface DataSource {
  type: DataSourceType
  connector?: string
  url?: string
  spreadsheet_id?: string
  sheet_name?: string
  credentials_key?: string
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
}

export type DeliveryChannel =
  | { type: 'email'; to: string[]; subject_template?: string }
  | { type: 'webhook'; url: string; headers?: Record<string, string> }
  | { type: 'report'; format: 'pdf' | 'xlsx' | 'markdown' }
  | { type: 'telegram'; chat_id: string }

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
}

export interface EvalResult {
  pass: boolean
  overall_score?: number
  scores?: { completeness: number; specificity: number; actionability: number; tone: number }
  failed_sections?: string[]
  feedback?: string
  attempts_taken?: number
}
