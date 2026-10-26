CREATE TABLE IF NOT EXISTS reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL,
 problem text NOT NULL,
 environment text NOT NULL,
 root_cause text NOT NULL,
 solution text NOT NULL,
 verification text NOT NULL,
 tags text[] NOT NULL DEFAULT '{}',
 agent text NOT NULL,
 author_id text,
 source_url text,
 fingerprint text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 search_vector tsvector GENERATED ALWAYS AS (
 setweight(to_tsvector('english', title), 'A') ||
 setweight(to_tsvector('english', problem || ' ' || environment || ' ' || root_cause), 'B') ||
 setweight(to_tsvector('english', solution), 'C')
 ) STORED
);
-- statement
CREATE INDEX IF NOT EXISTS reports_search_idx ON reports USING gin(search_vector);
-- statement
CREATE INDEX IF NOT EXISTS reports_tags_idx ON reports USING gin(tags);
-- statement
CREATE INDEX IF NOT EXISTS reports_created_idx ON reports(created_at DESC);
-- statement
CREATE TABLE IF NOT EXISTS write_quotas (key text NOT NULL, window_start timestamptz NOT NULL, count integer NOT NULL, PRIMARY KEY(key,window_start));
-- statement
CREATE TABLE IF NOT EXISTS experiments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL,
 question text NOT NULL,
 hypothesis text NOT NULL,
 method text NOT NULL,
 inputs text NOT NULL,
 conditions text NOT NULL,
 success_criteria text NOT NULL,
 tags text[] NOT NULL,
 agent text NOT NULL,
 visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
 status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','running','completed','cancelled')),
 owner_hash text NOT NULL,
 fingerprint text NOT NULL,
 replication_of uuid REFERENCES experiments(id),
 replication_reason text,
 outcome text CHECK (outcome IN ('supported','not_supported','inconclusive','technical_failure','cancelled')),
 observations text,
 evidence text,
 limitations text,
 metrics jsonb NOT NULL DEFAULT '[]',
 artifacts jsonb NOT NULL DEFAULT '[]',
 outcome_hash text,
 created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 completed_at timestamptz,
 UNIQUE(owner_hash,fingerprint),
 search_vector tsvector GENERATED ALWAYS AS (
 setweight(to_tsvector('english',title || ' ' || question),'A') ||
 setweight(to_tsvector('english',hypothesis || ' ' || method || ' ' || inputs || ' ' || conditions),'B') ||
 setweight(to_tsvector('english',coalesce(observations,'') || ' ' || coalesce(evidence,'')),'C')
 ) STORED
);
-- statement
CREATE INDEX IF NOT EXISTS experiments_search_idx ON experiments USING gin(search_vector);
-- statement
CREATE INDEX IF NOT EXISTS experiments_tags_idx ON experiments USING gin(tags);
-- statement
CREATE INDEX IF NOT EXISTS experiments_owner_idx ON experiments(owner_hash);
-- statement
CREATE INDEX IF NOT EXISTS experiments_public_created_idx ON experiments(created_at DESC) WHERE visibility='public';
-- statement
CREATE TABLE IF NOT EXISTS reproduction_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 experiment_id uuid NOT NULL REFERENCES experiments(id),
 reproduction_id uuid NOT NULL UNIQUE REFERENCES experiments(id),
 result text NOT NULL CHECK(result IN ('reproduced','not_reproduced','inconclusive','technical_failure')),
 observations text NOT NULL,
 evidence text NOT NULL,
 differences text NOT NULL,
 report_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(experiment_id <> reproduction_id)
);
-- statement
CREATE INDEX IF NOT EXISTS reproduction_target_idx ON reproduction_reports(experiment_id);
-- statement
CREATE OR REPLACE VIEW public_reproduction_summary AS
 SELECT r.experiment_id,
 count(*) FILTER(WHERE r.result='reproduced')::int AS reproduced_count,
 count(*) FILTER(WHERE r.result='not_reproduced')::int AS not_reproduced_count,
 count(*) FILTER(WHERE r.result='inconclusive')::int AS inconclusive_count,
 count(*) FILTER(WHERE r.result='technical_failure')::int AS technical_failure_count
 FROM reproduction_reports r JOIN experiments e ON e.id=r.reproduction_id
 WHERE e.visibility='public' GROUP BY r.experiment_id;
