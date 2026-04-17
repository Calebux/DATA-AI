export interface McpServer {
  name: string
  label: string
  url: string
  description: string
  enabled: boolean
}

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
  id: string
  run_id: string
  event_type: AgentEventType
  source_agent: AgentRole
  target_agent?: AgentRole
  step_id?: string
  payload: Record<string, unknown>
  created_at: string
}

export type TriggerType =
  | 'cron'
  | 'google_sheets'
  | 'webhook'
  | 'email'
  | 'web_scrape'
  | 'file_upload'
  | 'manual'

export type DataSourceType =
  | 'api'
  | 'web_scrape'
  | 'google_sheets'
  | 'webhook'
  | 'file'

export interface DataSource {
  type: DataSourceType
  connector?: string
  url?: string
  spreadsheet_id?: string
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

export type DeliveryChannelType =
  | { type: 'email'; to: string[]; subject_template?: string }
  | { type: 'webhook'; url: string; headers?: Record<string, string> }
  | { type: 'report'; format: 'pdf' | 'xlsx' | 'markdown' }
  | { type: 'telegram'; chat_id: string }

export interface WorkflowDefinition {
  id: string
  name: string
  category: string
  trigger: {
    type: TriggerType
    cron_expression?: string
    timezone?: string
  }
  steps: WorkflowStep[]
  output: { channels: DeliveryChannelType[] }
  system_prompt?: string
  mcp_servers?: McpServer[]
  webhook_secret?: string
}

export type WorkflowStatus = 'active' | 'paused' | 'draft'
export type RunStatus = 'running' | 'complete' | 'failed'

export interface Workflow {
  id: string
  user_id: string
  name: string
  category: string
  description?: string
  status: WorkflowStatus
  definition: WorkflowDefinition
  created_at: string
  updated_at: string
}

export interface WorkflowRun {
  id: string
  workflow_id: string
  status: RunStatus
  triggered_at: string
  completed_at?: string
  quality_score?: number
  error_message?: string
}

export interface Report {
  id: string
  run_id: string
  title: string
  content: Record<string, unknown>
  format: string
  created_at: string
}

export interface AgentMemory {
  id: string
  run_id: string
  user_id?: string
  workflow_id?: string
  step_id?: string
  agent_role: string
  memory_tier: 'episodic' | 'semantic'
  key?: string
  output?: Record<string, unknown>
  tokens_used?: number
  confidence?: number
  created_at: string
}

export interface EvalResult {
  pass: boolean
  overall_score?: number
  scores?: {
    completeness: number
    specificity: number
    actionability: number
    tone: number
  }
  failed_sections?: string[]
  feedback?: string
  attempts_taken?: number
}

export type WorkflowCategory =
  | 'finance_executive'
  | 'customer_success'
  | 'sales'
  | 'marketing'
  | 'operations'
  | 'product'
  | 'hr'
  | 'custom'

export interface WorkflowTemplate {
  id: string
  name: string
  category: WorkflowCategory
  description: string
  icon: string
  prompt: string
  system_prompt: string
  mcp_servers?: Omit<McpServer, 'enabled'>[]
  triggers: TriggerType[]
  outputs: string[]
  definition: Omit<WorkflowDefinition, 'id'>
}
