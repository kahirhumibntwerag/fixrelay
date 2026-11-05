CREATE TABLE IF NOT EXISTS research_series_charts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id),
 title text NOT NULL, caption text NOT NULL DEFAULT '', x_label text NOT NULL DEFAULT 'Step',
 y_label text NOT NULL DEFAULT 'Value', unit text NOT NULL DEFAULT '',
 chart_type text NOT NULL DEFAULT 'line' CHECK(chart_type IN ('line','scatter','bar')),
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz, published_through bigint
);
-- statement
CREATE INDEX IF NOT EXISTS research_series_charts_campaign_idx ON research_series_charts(campaign_id,created_at,id);
-- statement
CREATE TABLE IF NOT EXISTS research_series_points (
 id bigserial PRIMARY KEY, chart_id uuid NOT NULL REFERENCES research_series_charts(id) ON DELETE CASCADE,
 series text NOT NULL, x double precision NOT NULL, y double precision NOT NULL,
 observed_at timestamptz NOT NULL, run_id uuid REFERENCES research_runs(id), note text NOT NULL DEFAULT ''
);
-- statement
CREATE INDEX IF NOT EXISTS research_series_points_chart_idx ON research_series_points(chart_id,observed_at,id);
