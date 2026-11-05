import { z } from "zod";
import { getAuthPool } from "./auth";
import { assertCampaignAccess, ResearchError } from "./research";
import type { Principal } from "./auth-access";

export const seriesListSchema = z.object({ campaign_id: z.string().uuid(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(50).default(20) });
export const seriesDetailSchema = z.object({ campaign_id: z.string().uuid(), chart_id: z.string().uuid(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(2000).default(1000) });

export async function listSeriesCharts(input: unknown, principal?: Principal) {
  const p = seriesListSchema.parse(input), db = getAuthPool();
  if (principal) await assertCampaignAccess(db,p.campaign_id,principal);
  const {rows} = await db.query(`SELECT s.id,s.campaign_id,s.title,s.caption,s.x_label,s.y_label,s.unit,s.chart_type,s.created_at,s.published_at,
      (s.published_at IS NOT NULL AND c.visibility='public') AS is_public,
      (SELECT count(*)::int FROM research_series_points p WHERE p.chart_id=s.id ${principal ? "" : "AND p.id<=s.published_through"}) AS point_count
    FROM research_series_charts s JOIN campaigns c ON c.id=s.campaign_id
    WHERE s.campaign_id=$1 ${principal ? "" : "AND s.published_at IS NOT NULL AND c.visibility='public'"}
    ORDER BY s.created_at DESC,s.id OFFSET $2 LIMIT $3`,[p.campaign_id,p.offset,p.limit+1]);
  return {charts:rows.slice(0,p.limit),next_offset:rows.length>p.limit ? p.offset+p.limit : null};
}

export async function getSeriesChart(input: unknown, principal?: Principal) {
  const p = seriesDetailSchema.parse(input), db = getAuthPool();
  if (principal) await assertCampaignAccess(db,p.campaign_id,principal);
  const {rows} = await db.query(`SELECT s.id,s.campaign_id,s.title,s.caption,s.x_label,s.y_label,s.unit,s.chart_type,s.created_at,s.published_at,s.published_through,
    (s.published_at IS NOT NULL AND c.visibility='public') AS is_public
    FROM research_series_charts s JOIN campaigns c ON c.id=s.campaign_id WHERE s.id=$1 AND s.campaign_id=$2
    ${principal ? "" : "AND s.published_at IS NOT NULL AND c.visibility='public'"}`, [p.chart_id,p.campaign_id]);
  if (!rows[0]) throw new ResearchError("Chart not found or access denied",404);
  const points = await db.query(`SELECT id::text,series,x,y,observed_at,${principal ? "run_id" : "NULL::uuid AS run_id"},note FROM research_series_points
    WHERE chart_id=$1 ${principal ? "" : "AND id<=$4"} ORDER BY observed_at,id OFFSET $2 LIMIT $3`,
    principal ? [p.chart_id,p.offset,p.limit+1] : [p.chart_id,p.offset,p.limit+1,rows[0].published_through]);
  return {chart:rows[0],points:points.rows.slice(0,p.limit),next_offset:points.rows.length>p.limit ? p.offset+p.limit : null};
}
