CREATE TABLE IF NOT EXISTS research_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  experiment_id uuid REFERENCES experiments(id),
  metric_id uuid REFERENCES research_metrics(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 6000),
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  image bytea NOT NULL CHECK (octet_length(image) BETWEEN 1 AND 2097152),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 2097152),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK (octet_length(image) = byte_size)
);
-- statement
CREATE INDEX IF NOT EXISTS research_charts_campaign_idx
  ON research_charts(campaign_id,created_at,id);
