-- DATA-AI Agent Swarm Layer — Migration
-- Run: supabase db push

-- workflows (core table — create if running fresh, skip if exists)
CREATE TABLE IF NOT EXISTS workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'custom',
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','draft')),
  definition  JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- workflow_runs
CREATE TABLE IF NOT EXISTS workflow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID REFERENCES workflows(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','complete','failed')),
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  quality_score   NUMERIC CHECK (quality_score BETWEEN 0 AND 1),
  error_message   TEXT,
  metadata        JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_id     ON workflow_runs(user_id);

-- agent_events (powers live UI feed)
CREATE TABLE IF NOT EXISTS agent_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  source_agent    TEXT NOT NULL,
  target_agent    TEXT,
  step_id         TEXT,
  payload         JSONB DEFAULT '{}',
  correlation_id  UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_run_id  ON agent_events(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_created ON agent_events(created_at DESC);

-- agent_memory (episodic + semantic)
CREATE TABLE IF NOT EXISTS agent_memory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID REFERENCES workflow_runs(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  workflow_id   UUID REFERENCES workflows(id) ON DELETE SET NULL,
  step_id       TEXT,
  agent_role    TEXT NOT NULL,
  memory_tier   TEXT NOT NULL DEFAULT 'episodic' CHECK (memory_tier IN ('episodic','semantic')),
  key           TEXT,
  output        JSONB,
  tokens_used   INTEGER,
  confidence    NUMERIC CHECK (confidence BETWEEN 0 AND 1),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_run_id ON agent_memory(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_user_id ON agent_memory(user_id);

-- reports
CREATE TABLE IF NOT EXISTS reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID REFERENCES workflow_runs(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     JSONB NOT NULL DEFAULT '{}',
  format      TEXT NOT NULL DEFAULT 'json',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_run_id ON reports(run_id);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE agent_events;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_runs;

-- Row Level Security
ALTER TABLE workflows      ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_workflows"   ON workflows    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_runs"        ON workflow_runs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_events"      ON agent_events  FOR ALL USING (run_id IN (SELECT id FROM workflow_runs WHERE user_id = auth.uid()));
CREATE POLICY "users_own_memory"      ON agent_memory  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_reports"     ON reports       FOR ALL USING (run_id IN (SELECT id FROM workflow_runs WHERE user_id = auth.uid()));

-- Service role bypass
CREATE POLICY "service_workflows"  ON workflows    FOR ALL TO service_role USING (true);
CREATE POLICY "service_runs"       ON workflow_runs FOR ALL TO service_role USING (true);
CREATE POLICY "service_events"     ON agent_events  FOR ALL TO service_role USING (true);
CREATE POLICY "service_memory"     ON agent_memory  FOR ALL TO service_role USING (true);
CREATE POLICY "service_reports"    ON reports       FOR ALL TO service_role USING (true);
