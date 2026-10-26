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
CREATE TABLE IF NOT EXISTS campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL, question text NOT NULL, summary text NOT NULL,
 visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
 owner_hash text NOT NULL, fingerprint text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_hash,fingerprint)
);
-- statement
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id);
-- statement
CREATE INDEX IF NOT EXISTS experiments_campaign_idx ON experiments(campaign_id,created_at,id);
-- statement
CREATE TABLE IF NOT EXISTS experiment_links (
 campaign_id uuid NOT NULL REFERENCES campaigns(id),
 parent_id uuid NOT NULL REFERENCES experiments(id), child_id uuid NOT NULL REFERENCES experiments(id),
 relation text NOT NULL CHECK(relation IN ('follow_up','refinement','replication','dependency')),
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(parent_id,child_id), CHECK(parent_id<>child_id)
);
-- statement
CREATE INDEX IF NOT EXISTS experiment_links_child_idx ON experiment_links(child_id);
-- statement
CREATE OR REPLACE FUNCTION link_campaign_experiments(cid uuid,pid uuid,kid uuid,owner text,kind text,why text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM campaigns WHERE id=cid AND owner_hash=owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Campaign inaccessible'; END IF;
 IF pid=kid THEN RAISE EXCEPTION 'A link cannot create a cycle'; END IF;
 IF (SELECT count(*) FROM experiments WHERE id IN(pid,kid) AND campaign_id=cid AND owner_hash=owner)<>2 THEN
 RAISE EXCEPTION 'Both experiments must belong to this campaign and owner'; END IF;
 IF EXISTS(WITH RECURSIVE reach(id) AS (
 SELECT child_id FROM experiment_links WHERE campaign_id=cid AND parent_id=kid
 UNION SELECT l.child_id FROM experiment_links l JOIN reach r ON l.parent_id=r.id WHERE l.campaign_id=cid
 ) SELECT 1 FROM reach WHERE id=pid) THEN RAISE EXCEPTION 'A link cannot create a cycle'; END IF;
 INSERT INTO experiment_links(campaign_id,parent_id,child_id,relation,reason) VALUES(cid,pid,kid,kind,why) ON CONFLICT(parent_id,child_id) DO NOTHING;
 IF NOT FOUND AND EXISTS(SELECT 1 FROM experiment_links WHERE parent_id=pid AND child_id=kid AND (relation<>kind OR reason<>why)) THEN
 RAISE EXCEPTION 'This link already has a different relation or reason'; END IF;
 RETURN true;
END $$;
-- statement
ALTER TABLE reproduction_reports ALTER COLUMN reproduction_id DROP NOT NULL;
-- statement
ALTER TABLE reproduction_reports ADD COLUMN IF NOT EXISTS owner_hash text;
-- statement
ALTER TABLE reproduction_reports ADD COLUMN IF NOT EXISTS agent text;
-- statement
ALTER TABLE reproduction_reports ADD COLUMN IF NOT EXISTS conditions text;
-- statement
ALTER TABLE reproduction_reports ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public'));
-- statement
UPDATE reproduction_reports r SET owner_hash=e.owner_hash,agent=e.agent,conditions=e.conditions FROM experiments e WHERE r.reproduction_id=e.id AND r.owner_hash IS NULL;
-- statement
ALTER TABLE reproduction_reports DROP CONSTRAINT IF EXISTS reproduction_reports_result_check;
-- statement
ALTER TABLE reproduction_reports ADD CONSTRAINT reproduction_reports_result_check CHECK(result IN ('reproduced','not_reproduced','unable_to_assess','inconclusive','technical_failure'));
-- statement
CREATE UNIQUE INDEX IF NOT EXISTS reproduction_owner_digest_idx ON reproduction_reports(owner_hash,report_hash);
-- statement
CREATE OR REPLACE VIEW public_reproduction_summary AS
 SELECT r.experiment_id,
 count(*) FILTER(WHERE r.result='reproduced')::int AS reproduced_count,
 count(*) FILTER(WHERE r.result='not_reproduced')::int AS not_reproduced_count,
 count(*) FILTER(WHERE r.result='inconclusive')::int AS inconclusive_count,
 count(*) FILTER(WHERE r.result='technical_failure')::int AS technical_failure_count,
 count(*) FILTER(WHERE r.result='unable_to_assess')::int AS unable_to_assess_count
 FROM reproduction_reports r LEFT JOIN experiments e ON e.id=r.reproduction_id
 WHERE coalesce(e.visibility,r.visibility)='public' GROUP BY r.experiment_id;
