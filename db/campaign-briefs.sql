CREATE TABLE IF NOT EXISTS research_campaign_briefs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES campaigns(id),
 overview text NOT NULL, findings text NOT NULL,
 methods_and_protocols text NOT NULL DEFAULT '', experiments text NOT NULL DEFAULT '',
 decisions text NOT NULL DEFAULT '', reproducibility text NOT NULL DEFAULT '',
 failed_approaches text NOT NULL DEFAULT '', limitations text NOT NULL DEFAULT '',
 open_questions text NOT NULL DEFAULT '', next_steps text NOT NULL DEFAULT '',
 evidence_ids uuid[] NOT NULL DEFAULT '{}',
 author text NOT NULL, author_user_id text NOT NULL REFERENCES "user"(id),
 based_on_event_id bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
ALTER TABLE research_campaign_briefs ADD COLUMN IF NOT EXISTS methods_and_protocols text NOT NULL DEFAULT '';
ALTER TABLE research_campaign_briefs ADD COLUMN IF NOT EXISTS experiments text NOT NULL DEFAULT '';
ALTER TABLE research_campaign_briefs ADD COLUMN IF NOT EXISTS decisions text NOT NULL DEFAULT '';
ALTER TABLE research_campaign_briefs ADD COLUMN IF NOT EXISTS reproducibility text NOT NULL DEFAULT '';
-- statement
CREATE INDEX IF NOT EXISTS research_campaign_briefs_latest_idx
 ON research_campaign_briefs(campaign_id,created_at DESC,id DESC);
