ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS objective text;
-- statement
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed'));
-- statement
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS constraints text NOT NULL DEFAULT '';
-- statement
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS stop_conditions text NOT NULL DEFAULT '';
-- statement
CREATE TABLE IF NOT EXISTS research_campaign_members (
 campaign_id uuid NOT NULL REFERENCES campaigns(id), user_id text NOT NULL REFERENCES "user"(id),
 role text NOT NULL CHECK(role IN ('owner','researcher','viewer')), PRIMARY KEY(campaign_id,user_id)
);
-- statement
CREATE INDEX IF NOT EXISTS research_members_user_idx ON research_campaign_members(user_id,campaign_id);
-- statement
CREATE TABLE IF NOT EXISTS research_metrics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id),
 name text NOT NULL, unit text NOT NULL DEFAULT '', direction text NOT NULL CHECK(direction IN ('maximize','minimize','range')),
 baseline double precision, target double precision NOT NULL, target_max double precision,
 evaluation_protocol text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(direction <> 'range' OR target_max >= target)
);
-- statement
CREATE TABLE IF NOT EXISTS research_hypotheses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id),
 parent_hypothesis_id uuid REFERENCES research_hypotheses(id),
 relationship text NOT NULL DEFAULT 'derived_from' CHECK(relationship IN ('derived_from','revision_of','alternative_to','motivated_by')),
 title text NOT NULL, statement text NOT NULL, rationale text NOT NULL, prediction text NOT NULL,
 status text NOT NULL DEFAULT 'untested' CHECK(status IN ('untested','testing','supported','contradicted','inconclusive')),
 agent text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS research_hypotheses_campaign_idx ON research_hypotheses(campaign_id,created_at,id);
-- statement
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS hypothesis_id uuid REFERENCES research_hypotheses(id);
-- statement
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS variables jsonb NOT NULL DEFAULT '{}';
-- statement
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS controls jsonb NOT NULL DEFAULT '{}';
-- statement
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS expected_outcome text NOT NULL DEFAULT '';
-- statement
CREATE TABLE IF NOT EXISTS research_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), experiment_id uuid NOT NULL REFERENCES experiments(id),
 agent text NOT NULL, agent_key_id uuid REFERENCES research_agent_keys(id), status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed','cancelled')),
 progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100), task text NOT NULL DEFAULT '', next_action text NOT NULL DEFAULT '',
 configuration jsonb NOT NULL DEFAULT '{}', summary text NOT NULL DEFAULT '', outcome text,
 started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, last_heartbeat_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS research_runs_experiment_idx ON research_runs(experiment_id,started_at,id);
-- statement
CREATE TABLE IF NOT EXISTS research_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES research_runs(id),
 metric_id uuid REFERENCES research_metrics(id), value double precision, unit text NOT NULL DEFAULT '',
 qualitative text NOT NULL DEFAULT '', sample_size integer CHECK(sample_size>0), uncertainty text NOT NULL DEFAULT '',
 evidence text NOT NULL, conditions_key text NOT NULL, supersedes_id uuid REFERENCES research_observations(id),
 agent text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CHECK(value IS NOT NULL OR qualitative <> '')
);
-- statement
CREATE INDEX IF NOT EXISTS research_observations_run_idx ON research_observations(run_id,created_at,id);
-- statement
CREATE TABLE IF NOT EXISTS research_analyses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), experiment_id uuid NOT NULL REFERENCES experiments(id),
 interpretation text NOT NULL, comparison text NOT NULL DEFAULT '', limitations text NOT NULL,
 uncertainty text NOT NULL DEFAULT '', confounders text NOT NULL DEFAULT '', alternative_explanations text NOT NULL DEFAULT '',
 conclusive boolean NOT NULL DEFAULT false, evidence_ids uuid[] NOT NULL,
 supersedes_id uuid REFERENCES research_analyses(id), agent text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS research_analyses_experiment_idx ON research_analyses(experiment_id,created_at,id);
-- statement
CREATE TABLE IF NOT EXISTS research_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hypothesis_id uuid NOT NULL REFERENCES research_hypotheses(id), experiment_id uuid NOT NULL REFERENCES experiments(id),
 outcome text NOT NULL CHECK(outcome IN ('supported','contradicted','inconclusive')), rationale text NOT NULL,
 next_action text NOT NULL, evidence_ids uuid[] NOT NULL, next_hypothesis_id uuid REFERENCES research_hypotheses(id),
 supersedes_id uuid REFERENCES research_decisions(id), agent text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE TABLE IF NOT EXISTS research_artifacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES research_runs(id), type text NOT NULL,
 url text NOT NULL, checksum text NOT NULL, version text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE TABLE IF NOT EXISTS research_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id), experiment_id uuid REFERENCES experiments(id),
 proposed_action text NOT NULL, rationale text NOT NULL, evidence_ids uuid[] NOT NULL DEFAULT '{}', impact text NOT NULL DEFAULT '', costs text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 requested_by text NOT NULL, reviewed_by text REFERENCES "user"(id), feedback text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
-- statement
CREATE INDEX IF NOT EXISTS research_reviews_campaign_idx ON research_reviews(campaign_id,status,created_at,id);
-- statement
CREATE TABLE IF NOT EXISTS research_events (
 id bigserial PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES campaigns(id), entity_id uuid NOT NULL,
 event_type text NOT NULL, actor text NOT NULL, actor_user_id text NOT NULL REFERENCES "user"(id),
 description text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS research_events_campaign_idx ON research_events(campaign_id,id);
-- statement
CREATE TABLE IF NOT EXISTS research_mutations (
 user_id text NOT NULL REFERENCES "user"(id), idempotency_key text NOT NULL, fingerprint text NOT NULL,
 response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,idempotency_key)
);
-- statement
CREATE OR REPLACE FUNCTION research_prevent_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Research history is append-only; append an explicit correction'; END $$;
-- statement
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['research_events','research_observations','research_analyses','research_decisions'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=t || '_immutable') THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION research_prevent_rewrite()', t || '_immutable', t);
  END IF;
 END LOOP;
END $$;
