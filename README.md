# DATA-AI (HoursBack v2) — Agent Swarm Platform

A visual dashboard for building, deploying, and monitoring multi-agent AI workflows. Define a pipeline of specialized agents, set a trigger, and let the swarm run — with real-time observability, consensus voting, human escalation, and quality-gated report delivery built in.

---

## What it does

You configure a **workflow**: a named pipeline of agent steps, a trigger (manual, cron, or webhook), and delivery channels (email, webhook, Telegram, or report). When triggered, an orchestrator fans out to specialized AI agents in dependency order, collects results into shared working memory, and delivers a quality-scored output.

Everything is observable in real time. You can watch the swarm execute, replay the event stream, inspect consensus votes, approve or reject escalations, and read the final generated report — all from one UI.

---

## Architecture

```
Browser (Next.js)
    │
    ├── /api/runs          POST → creates run record, fires orchestrator
    └── /api/webhook/[id]  POST → external webhook trigger
              │
              ▼
   Supabase Edge Function: orchestrator
    │
    ├── Builds task graph (phases from depends_on DAG)
    ├── Runs phases in parallel with Promise.allSettled
    └── Invokes per-step edge functions:
         ├── agent-data-ingestor   Fetches APIs, web scrapes, CSV, Google Sheets
         ├── agent-researcher      Claude-powered web research + context enrichment
         ├── agent-analyst         Claude reasoning → structured JSON report
         ├── agent-critic          A2A critique loop — reviews analyst output
         ├── agent-eval            Quality scoring with auto-retry (score < 0.75 → revise)
         ├── agent-escalator       Pauses run, awaits human Approve/Reject
         ├── agent-delivery        Webhook, Telegram, report storage
         └── cron-runner           Fires scheduled workflows via cron expressions
              │
              ▼
   Supabase Postgres + Realtime
    ├── workflows          User's workflow definitions (JSONB)
    ├── workflow_runs      Run records with status + quality_score
    ├── agent_events       Every event emitted during execution
    ├── agent_memory       Per-step outputs for debugging
    └── reports            Final delivered reports
```

The frontend subscribes to `agent_events` via Supabase Realtime to stream the live event feed and swarm visualizer without polling.

---

## Agent Roles

| Role | Function |
|---|---|
| `data_ingestor` | Pulls raw data from external sources (APIs, web scrape, Google Sheets, CSV). No LLM call — pure HTTP. |
| `researcher` | Uses Claude to search the web, synthesise background context, and enrich the raw data before analysis. |
| `analyst` | Sends enriched data + instructions to Claude with structured JSON output. Validates output keys. Stores to `agent_memory`. |
| `critic` | Reviews the analyst's output, scores reasoning quality, and returns structured feedback. Drives the A2A critique loop. |
| `eval` | Scores the final report (completeness, specificity, actionability, tone). If score < 0.75, reinvokes the analyst with feedback. Retries up to `max_retries` times. Updates `quality_score` on the run. |
| `escalator` | Emits `ESCALATION_REQUESTED` event and long-polls (90s) for a `HUMAN_APPROVED` or `HUMAN_REJECTED` event from the Inbox UI. |
| `delivery` | Dispatches output via outbound webhook, Telegram bot, or Supabase Storage. Writes to `reports` table. |

### Consensus mode

Any analyst step can run in **consensus mode** by setting `consensus` on the step:

```jsonc
{
  "consensus": {
    "agent_count": 3,
    "agreement_threshold": 0.67,
    "reconciliation": "highest_confidence"
  }
}
```

The orchestrator spawns `agent_count` parallel instances of the same agent, waits for at least `agreement_threshold × agent_count` to succeed, then picks the winner by `reconciliation` strategy (`highest_confidence` or `majority`). Each vote is emitted as a `CONSENSUS_VOTE` event, visible in the Consensus tab.

---

## Workflow Definition Schema

A workflow is stored in Postgres as a `WorkflowDefinition` JSONB object:

```ts
interface WorkflowDefinition {
  name: string
  category: string
  trigger: {
    type: 'manual' | 'cron' | 'webhook' | 'email' | 'file_upload'
    cron_expression?: string   // e.g. "0 8 * * MON"
    timezone?: string
  }
  steps: WorkflowStep[]
  output: { channels: DeliveryChannel[] }
  system_prompt?: string       // Injected into every analyst agent
  mcp_servers?: McpServer[]    // Listed MCP integrations for reference
  webhook_secret?: string      // Optional: validates X-Webhook-Secret header
}

interface WorkflowStep {
  step_id: string
  agent_role: AgentRole
  depends_on: string[]         // Step IDs that must complete first
  instructions: string         // Natural-language task prompt
  data_sources?: DataSource[]  // For data_ingestor steps
  input_sources: string[]      // Keys from working memory to inject
  output_keys: string[]        // Keys the agent must return
  timeout_ms: number
  consensus?: ConsensusConfig
  max_retries?: number
}
```

Steps with no `depends_on` are in phase 0. Steps whose dependencies are all satisfied run in the next phase. This topological sort allows maximum parallelism while respecting data dependencies.

---

## Built-in Templates

| Template | Category | Description |
|---|---|---|
| Weekly SaaS Intelligence Report | Finance | Stripe + HubSpot → churn risk → CEO briefing, 8AM Monday |
| Monthly Revenue Summary | Finance | 13 months of Stripe data → board-ready P&L analysis |
| Churn Risk Monitor | Customer Success | Daily CRM scan → at-risk account scoring → CS Slack alert |
| Competitive Intelligence Tracker | Product | Weekly competitor scrape → pricing/feature change digest |
| Sales Pipeline Review | Sales | CRM deal hygiene → weighted forecast → sales manager email |
| Infrastructure Alert Monitor | Operations | Webhook-triggered → severity triage (consensus) → escalate or auto-resolve |
| Support Agent | Operations | Fetch docs URL → answer from knowledge base → escalate unanswered |
| Data Analyst | Product | CSV/JSON URL → descriptive stats → markdown report |
| Lead Research Agent | Sales | Web research → lead qualification → Slack alert if interesting |
| Custom Workflow | Custom | Blank canvas — build your own pipeline |

---

## Pages

| Route | Description |
|---|---|
| `/dashboard` | Workflow grid. Run, delete, and navigate to any workflow. |
| `/workflows/new` | 4-step wizard: pick template → configure steps → set trigger → save. |
| `/workflows/[id]` | Full workflow detail: swarm visualizer, live event feed, replay, consensus log, comms graph, history, triggers, and report tabs. |
| `/runs` | Kanban board of all runs across all workflows (Running / Completed / Failed). Click a run to open the inspector drawer. |
| `/inbox` | Human escalation inbox — approve or reject pending agent escalations. |
| `/knowledge` | Knowledge base: drag-drop files or add URL sources. |
| `/analytics` | Aggregate stats: run counts, quality scores, success rates, agent activity. |
| `/profile` | User account settings. |
| `/auth` | Email + password auth via Supabase Auth. |

---

## Real-time UI Components

| Component | What it shows |
|---|---|
| `SwarmVisualizer` | Animated DAG of workflow steps. Nodes pulse when active, solidify on completion. |
| `AgentCopilot` | Live scrolling event feed — every `TASK_ASSIGNED`, `CONSENSUS_VOTE`, `ESCALATION_REQUESTED`, etc. |
| `SwarmReplay` | Step-through replay of a completed run's event stream. |
| `ConsensusLog` | Per-vote breakdown for all consensus steps: instance ID, outputs, confidence scores, winner. |
| `AgentCommsGraph` | Graph of which agents communicated with which during the run. |
| `SwarmMetrics` | Token usage, step durations, quality score, agent count. |
| `EscalationPanel` | Banner that appears when the escalator is waiting — shows severity and approve/reject buttons. |
| `RunInspectorDrawer` | Slide-in drawer from the Runs kanban with the same tabs as the workflow detail page. |
| `ReportRenderer` | Renders the final delivered report with section headings, quality score badge, and eval breakdown. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS, Apple-inspired design system |
| UI primitives | Radix UI (dialogs, tabs, select, switch, tooltip) |
| Charts | Recharts |
| Auth | Supabase Auth (email/password) + `@supabase/ssr` |
| Database | Supabase Postgres |
| Realtime | Supabase Realtime (broadcast + postgres_changes) |
| Edge functions | Supabase Edge Functions (Deno) |
| LLM | Anthropic Claude (claude-sonnet-4-6 via `@anthropic-ai/sdk`) |
| Export | jsPDF, xlsx |

---

## Database Tables

```sql
-- User-defined workflows
workflows (
  id uuid PK,
  user_id uuid,
  name text,
  category text,
  description text,
  status text,           -- 'active' | 'paused' | 'draft'
  definition jsonb,      -- WorkflowDefinition
  created_at timestamptz,
  updated_at timestamptz
)

-- One record per run invocation
workflow_runs (
  id uuid PK,
  workflow_id uuid FK,
  user_id uuid,
  status text,           -- 'running' | 'complete' | 'failed'
  triggered_at timestamptz,
  completed_at timestamptz,
  quality_score float,   -- 0.0–1.0, set by eval agent
  error_message text
)

-- Every event emitted by the swarm
agent_events (
  id uuid PK,
  run_id uuid FK,
  event_type text,       -- START_WORKFLOW | TASK_ASSIGNED | TASK_COMPLETE |
                         -- CONSENSUS_START | CONSENSUS_VOTE | CONSENSUS_RESOLVED |
                         -- ESCALATION_REQUESTED | HUMAN_APPROVED | HUMAN_REJECTED |
                         -- WORKFLOW_COMPLETE | AGENT_ERROR
  source_agent text,
  step_id text,
  payload jsonb,
  created_at timestamptz
)

-- Per-step agent outputs (for debugging and replay)
agent_memory (
  id uuid PK,
  run_id uuid FK,
  step_id text,
  agent_role text,
  output jsonb,
  tokens_used int,
  created_at timestamptz
)

-- Final delivered reports
reports (
  id uuid PK,
  run_id uuid FK,
  title text,
  content jsonb,         -- { report, eval_result, delivery_results }
  format text,
  created_at timestamptz
)
```

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Calebux/DATA-AI.git
cd DATA-AI
npm install
```

### 2. Environment variables

Create `.env.local` from the example:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> Third-party keys (`OPENAI_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, etc.) are used only inside Supabase Edge Functions. Set them as **Supabase secrets** — not in `.env.local`.

### 3. Apply database migrations

```bash
supabase db push
```

Or run the SQL from `supabase/migrations/` directly in your project's SQL editor.

### 4. Deploy edge functions

```bash
supabase functions deploy orchestrator
supabase functions deploy agent-data-ingestor
supabase functions deploy agent-researcher
supabase functions deploy agent-analyst
supabase functions deploy agent-critic
supabase functions deploy agent-eval
supabase functions deploy agent-escalator
supabase functions deploy agent-delivery
supabase functions deploy cron-runner
```

Set the required secrets:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# Only needed for templates that use these connectors:
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set HUBSPOT_ACCESS_TOKEN=pat-...
supabase secrets set TELEGRAM_BOT_TOKEN=...
supabase secrets set RESEND_API_KEY=re_...
```

### 5. Start the dev server

```bash
npm run dev
# → http://localhost:3000
```

---

## Triggering a workflow

### Manual

Click **Run Now** on any workflow card or detail page. A confirmation modal shows the step plan before execution starts.

### Webhook

Every workflow has a unique HTTP trigger endpoint:

```bash
curl -X POST https://your-app.vercel.app/api/webhook/{workflowId} \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-secret" \
  -d '{"lead_email": "jane@example.com"}'
```

The request body is passed through as `trigger_context` and is available to agent steps that list it in `input_sources`. The `X-Webhook-Secret` header is only required if `definition.webhook_secret` is set on the workflow.

### Cron

Set `trigger.type = "cron"` with a `cron_expression` (e.g. `"0 8 * * MON"`) in the workflow definition, then configure a Supabase cron job or external scheduler to POST to the webhook endpoint on that schedule.

---

## Human-in-the-loop escalation

Workflows with an `escalator` step pause at that step and emit an `ESCALATION_REQUESTED` event. The approve/reject UI surfaces in two places:

- The `EscalationPanel` banner on the workflow detail page
- The `/inbox` page, which shows all pending escalations across all workflows

Clicking **Approve** or **Reject** (with optional notes) writes a `HUMAN_APPROVED` or `HUMAN_REJECTED` event. The escalator edge function is long-polling for this event and continues the run immediately when it arrives.

If no decision is made within **90 seconds**, the escalator records a timeout and the run continues with `outcome: "timeout"`.

---

## Quality scoring

The `eval` agent scores every synthesized report on four dimensions:

| Dimension | What it checks |
|---|---|
| Completeness | Are all required sections present? |
| Specificity | Are claims backed by exact figures? |
| Actionability | Do recommendations have concrete next steps? |
| Tone | Is the language appropriate for the audience? |

If any score falls below **0.75**, the eval agent re-invokes the analyst with structured feedback identifying the failing sections. This retry loop runs up to `max_retries` times (default 2). The final `overall_score` is written to `workflow_runs.quality_score` and displayed as a progress bar on dashboard cards.

---

## Design system

The UI follows an Apple-inspired design language documented in [`DESIGN.md`](./DESIGN.md):

- **Accent:** `#0071e3` — reserved exclusively for interactive elements
- **Light surfaces:** `#f5f5f7` background, `#1d1d1f` text
- **Dark execution sections:** `#000`/`#1a1a1e` — used for swarm visualizer, live feed, replay to signal "the machine is running"
- **Cards:** white background, `rgba(0,0,0,0.08)` border, soft shadow, subtle hover lift
- **Typography:** Inter with tight negative letter-spacing across all sizes

---

## video-use — AI video editing skill

[video-use](https://github.com/browser-use/video-use) is included as a Git submodule at `skills/video-use/`. It lets Claude Code edit raw screen recordings and demo footage into polished videos via conversational instructions — useful for creating demo videos of DATA-AI workflow runs.

### What it does

- Removes filler words, silence, and verbal slips automatically
- Applies color grading, audio fades, and subtitle burn-in
- Generates animation overlays (titles, diagrams, typography cards)
- Self-evaluates output quality before presenting the final render

Editing is transcript-driven: video is transcribed to word-level timestamps (via ElevenLabs Scribe), then Claude reasons from text rather than raw frames — making it fast and token-efficient.

### Install

```bash
# After cloning (submodule is already registered)
git submodule update --init --recursive

# Python dependencies
pip install -e skills/video-use

# Optional: animation overlays
pip install -e "skills/video-use[animations]"

# System tools
brew install ffmpeg          # required
brew install yt-dlp          # optional — for downloading online sources

# ElevenLabs API key (for transcription)
echo "ELEVENLABS_API_KEY=your_key_here" >> skills/video-use/.env
```

Activate as a Claude Code skill (one-time):

```bash
ln -s "$(pwd)/skills/video-use" ~/.claude/skills/video-use
```

### Usage

Navigate to a folder containing your raw video files and run `claude`:

```bash
cd /path/to/raw-recordings
claude
```

Then describe what you want:

> "Edit these screen recordings into a 90-second demo of the swarm visualizer running a revenue report workflow. Start with the workflow trigger, show the live event feed mid-run, end on the final report with the quality score."

Claude will inventory your sources, propose a strategy for approval, then produce `edit/final.mp4`.

---

## Scripts

```bash
npm run dev      # Development server on :3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint
```

---

## Project structure

```
app/
  api/
    runs/                 POST: create run + fire orchestrator
    webhook/[workflowId]/ POST: external webhook trigger
  dashboard/              Workflow grid
  workflows/new/          4-step creation wizard
  workflows/[id]/         Workflow detail + run monitoring
  runs/                   Cross-workflow run kanban
  inbox/                  Human escalation inbox
  knowledge/              Data sources manager
  analytics/              Aggregate stats

components/
  layout/                 Navbar, SubNav
  agent-copilot/          Live event feed
  swarm-visualizer/       Animated step DAG
  swarm-replay/           Event stream replay
  consensus-log/          Vote breakdown table
  agent-comms-graph/      Agent communication graph
  swarm-metrics/          Token + timing stats
  escalation-panel/       Human-in-the-loop banner
  run-inspector/          Slide-in run drawer
  orchestrator-modal/     Pre-run confirmation
  workflow-builder/       Edit drawer
  report-renderer/        Final report display
  webhook-executor/       Webhook test panel
  ui/                     Primitives (Button, Badge, Tabs, Spinner, etc.)

supabase/functions/
  orchestrator/           Coordinator — builds DAG, fans out steps
  agent-data-ingestor/    External data fetcher (API, CSV, scrape, sheets)
  agent-researcher/       Claude-powered web research + enrichment
  agent-analyst/          Claude reasoning agent → structured JSON
  agent-critic/           A2A critique — reviews and scores analyst output
  agent-eval/             Quality scoring + retry loop
  agent-escalator/        Human approval gate
  agent-delivery/         Webhook, Telegram, report storage
  cron-runner/            Scheduled workflow trigger
  _shared/types.ts        Shared TypeScript interfaces

data/workflows/index.ts   Built-in workflow templates
types/index.ts            Full TypeScript type definitions
lib/                      Supabase client helpers, utils
```
