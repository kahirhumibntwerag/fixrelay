CREATE TABLE IF NOT EXISTS research_comparison_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title text NOT NULL,
  caption text NOT NULL DEFAULT '',
  column_headers jsonb NOT NULL,
  data_rows jsonb NOT NULL,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS research_comparison_tables_campaign_idx
  ON research_comparison_tables(campaign_id,created_at,id);
