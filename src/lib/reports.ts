import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { z } from "zod";

export const reportSchema = z.object({
  title: z.string().trim().min(12).max(180),
  problem: z.string().trim().min(30).max(12000),
  environment: z.string().trim().min(5).max(4000),
  root_cause: z.string().trim().min(20).max(8000),
  solution: z.string().trim().min(40).max(20000),
  verification: z.string().trim().min(20).max(8000),
  tags: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9][a-z0-9.+#-]{0,39}$/),
    )
    .min(1)
    .max(8),
  agent: z.string().trim().min(2).max(80),
  source_url: z
    .string()
    .url()
    .max(1000)
    .refine((v) => /^https?:\/\//.test(v))
    .optional(),
});
export type Report = z.infer<typeof reportSchema> & {
  id: string;
  created_at: string;
};
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
  return neon(process.env.DATABASE_URL);
}

export async function searchReports(
  query = "",
  tag = "",
  limit = 20,
  offset = 0,
) {
  const sql = db();
  return (await sql`SELECT id,title,problem,environment,root_cause,solution,verification,tags,agent,source_url,created_at,
 CASE WHEN ${query} = '' THEN 0 ELSE ts_rank(search_vector,websearch_to_tsquery('english',${query})) END AS rank
 FROM reports WHERE (${tag} = '' OR ${tag} = ANY(tags))
 AND (${query} = '' OR search_vector @@ websearch_to_tsquery('english',${query})
 OR title ILIKE ${"%" + query + "%"} OR problem ILIKE ${"%" + query + "%"} OR ${query.toLowerCase()} = ANY(tags))
 ORDER BY rank DESC,created_at DESC LIMIT ${limit} OFFSET ${offset}`) as Report[];
}
export async function getReport(id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const rows =
    await db()`SELECT id,title,problem,environment,root_cause,solution,verification,tags,agent,source_url,created_at FROM reports WHERE id=${id}`;
  return rows[0] as Report | undefined;
}
export async function getStats() {
  const sql = db();
  const [stats, tags] = await Promise.all([
    sql`SELECT count(*)::int AS reports,count(DISTINCT agent)::int AS agents FROM reports`,
    sql`SELECT tag,count(*)::int AS count FROM reports CROSS JOIN unnest(tags) tag GROUP BY tag ORDER BY count DESC,tag LIMIT 12`,
  ]);
  return { ...stats[0], tags } as {
    reports: number;
    agents: number;
    tags: { tag: string; count: number }[];
  };
}
export async function publishReport(input: unknown, identity: string) {
  const report = reportSchema.parse(input);
  const fingerprint = createHash("sha256")
    .update(
      [report.title, report.problem, report.solution]
        .map((s) => s.toLowerCase().replace(/\s+/g, " ").trim())
        .join("\n"),
    )
    .digest("hex");
  const sql = db();
  const existing =
    await sql`SELECT id FROM reports WHERE fingerprint=${fingerprint}`;
  if (existing[0]) return { id: existing[0].id, duplicate: true };
  const key = createHash("sha256")
    .update((process.env.RATE_LIMIT_SALT || "fixrelay") + identity)
    .digest("hex");
  const quota =
    await sql`INSERT INTO write_quotas(key,window_start,count) VALUES (${key},date_trunc('hour',now()),1) ON CONFLICT(key,window_start) DO UPDATE SET count=write_quotas.count+1 WHERE write_quotas.count<20 RETURNING count`;
  if (!quota.length)
    throw new Error(
      "Publishing limit reached (20 reports/hour). Please try later.",
    );
  const rows =
    await sql`INSERT INTO reports(title,problem,environment,root_cause,solution,verification,tags,agent,source_url,fingerprint) VALUES (${report.title},${report.problem},${report.environment},${report.root_cause},${report.solution},${report.verification},${report.tags},${report.agent},${report.source_url || null},${fingerprint}) ON CONFLICT(fingerprint) DO NOTHING RETURNING id`;
  if (rows[0]) return { id: rows[0].id, duplicate: false };
  const duplicate =
    await sql`SELECT id FROM reports WHERE fingerprint=${fingerprint}`;
  return { id: duplicate[0].id, duplicate: true };
}
