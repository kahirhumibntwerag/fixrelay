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
