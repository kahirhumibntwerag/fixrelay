import { z } from "zod";
import { getAuthPool } from "./auth";
import { assertCampaignAccess } from "./research";
import type { Principal } from "./auth-access";

export const tableListSchema = z.object({
  campaign_id: z.string().uuid(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(30).default(10),
});

export async function listComparisonTables(input: unknown, principal?: Principal) {
  const { campaign_id, offset, limit } = tableListSchema.parse(input);
  const db = getAuthPool();
  if (principal) await assertCampaignAccess(db, campaign_id, principal);
  const { rows } = await db.query(
    `SELECT t.id,t.campaign_id,t.title,t.caption,t.column_headers AS "columns",t.data_rows AS "rows",t.created_at,t.published_at,
       (t.published_at IS NOT NULL AND c.visibility='public') AS is_public
       ${principal ? `,coalesce((SELECT json_agg(json_build_object('id',v.id,'version',v.version,'columns',v.column_headers,'rows',v.data_rows,'note',v.note,'created_at',v.created_at) ORDER BY v.version) FROM research_comparison_versions v WHERE v.table_id=t.id),'[]'::json) AS versions` : ""}
     FROM research_comparison_tables t JOIN campaigns c ON c.id=t.campaign_id
     WHERE t.campaign_id=$1 ${principal ? "" : "AND t.published_at IS NOT NULL AND c.visibility='public'"}
     ORDER BY t.created_at,t.id OFFSET $2 LIMIT $3`,
    [campaign_id, offset, limit + 1],
  );
  return { tables: rows.slice(0, limit), next_offset: rows.length > limit ? offset + limit : null };
}
