CREATE TABLE IF NOT EXISTS research_comparison_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 table_id uuid NOT NULL REFERENCES research_comparison_tables(id) ON DELETE CASCADE,
 version integer NOT NULL,
 column_headers jsonb NOT NULL, data_rows jsonb NOT NULL,
 note text NOT NULL DEFAULT '', created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(table_id,version)
);
-- statement
INSERT INTO research_comparison_versions(table_id,version,column_headers,data_rows,created_by,created_at)
 SELECT t.id,1,t.column_headers,t.data_rows,t.created_by,t.created_at
 FROM research_comparison_tables t
 WHERE NOT EXISTS (SELECT 1 FROM research_comparison_versions v WHERE v.table_id=t.id)
 ON CONFLICT (table_id,version) DO NOTHING;
