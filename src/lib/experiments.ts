import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./reports";

const text = (min: number, max = 12000) => z.string().trim().min(min).max(max);
export const accessTokenSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]{32,128}$/,
    "Use a random token of 32–128 URL-safe characters",
  );
export const statuses = [
  "planned",
  "running",
  "completed",
  "cancelled",
] as const;
export const outcomes = [
  "supported",
  "not_supported",
  "inconclusive",
  "technical_failure",
  "cancelled",
] as const;
export const registerSchema = z.object({
  title: text(12, 180),
  question: text(20),
  hypothesis: text(10),
  method: text(30, 16000),
  inputs: text(5, 8000),
  conditions: text(5, 8000),
  success_criteria: text(20, 8000),
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
  agent: text(2, 80),
  visibility: z.enum(["private", "public"]).default("private"),
  access_token: accessTokenSchema.optional(),
  replication_of: z.string().uuid().optional(),
  replication_reason: text(20, 4000).optional(),
  campaign_id: z.string().uuid().optional(),
  parents: z
    .array(
      z.object({
        id: z.string().uuid(),
        relation: z
          .enum(["follow_up", "refinement", "replication", "dependency"])
          .default("follow_up"),
        reason: text(10, 500),
      }),
    )
    .max(5)
    .default([]),
});
export const outcomeSchema = z.object({
  id: z.string().uuid(),
  access_token: accessTokenSchema,
  outcome: z.enum(outcomes),
  observations: text(20, 16000),
  evidence: text(20, 16000),
  limitations: text(10, 8000),
  metrics: z
    .array(
      z.object({
        name: text(1, 100),
        value: z.number().finite(),
        unit: text(1, 80).optional(),
      }),
    )
    .max(30)
    .default([]),
  artifacts: z
    .array(
      z
        .string()
        .url()
        .max(1000)
        .refine((s) => /^https?:\/\//.test(s), "Use an HTTP(S) URL"),
    )
    .max(10)
    .default([]),
});
export const reproductionSchema = z.object({
  experiment_id: z.string().uuid(),
  reproduction_id: z.string().uuid().optional(),
  access_token: accessTokenSchema.optional(),
  agent: text(2, 80).optional(),
  conditions: text(5, 4000).optional(),
  visibility: z.enum(["private", "public"]).default("private"),
  result: z.enum([
    "reproduced",
    "not_reproduced",
    "inconclusive",
    "technical_failure",
    "unable_to_assess",
  ]),
  observations: text(20, 16000),
  evidence: text(20, 16000),
  differences: text(10, 8000),
});
export type ReproductionReport = {
  id: string;
  experiment_id: string;
  reproduction_id: string | null;
  result:
    | "reproduced"
    | "not_reproduced"
    | "inconclusive"
    | "technical_failure"
    | "unable_to_assess";
  conditions: string;
  observations: string;
  evidence: string;
  differences: string;
  created_at: string;
  reproduction_title: string;
  agent: string;
  visibility: string;
};
export const searchSchema = z.object({
  query: z.string().max(500).default(""),
  tag: z.string().max(40).default(""),
  status: z.enum(statuses).optional(),
  outcome: z.enum(outcomes).optional(),
  access_token: accessTokenSchema.optional(),
  scope: z.enum(["accessible", "owned"]).default("accessible"),
  limit: z.number().int().min(1).max(50).default(5),
  offset: z.number().int().min(0).max(10000).default(0),
});
export type Experiment = {
  id: string;
  title: string;
  question: string;
  hypothesis: string;
  method: string;
  inputs: string;
  conditions: string;
  success_criteria: string;
  tags: string[];
  agent: string;
  visibility: "public" | "private";
  status: (typeof statuses)[number];
  replication_of: string | null;
  replication_reason: string | null;
  outcome: (typeof outcomes)[number] | null;
  observations: string | null;
  evidence: string | null;
  limitations: string | null;
  metrics: { name: string; value: number; unit?: string }[];
  artifacts: string[];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  reproducing_agent_count: number;
  not_reproducing_agent_count: number;
  reproduced_count: number;
  not_reproduced_count: number;
  inconclusive_count: number;
  technical_failure_count: number;
  unable_to_assess_count: number;
  campaign_id: string | null;
  campaign_title: string | null;
  reproduction_status:
    | "unreviewed"
    | "reproduced"
    | "not_reproduced"
    | "mixed"
    | "inconclusive";
  reproductions?: ReproductionReport[];
};
export class ExperimentError extends Error {}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const ownerHash = (token?: string) => (token ? hash(token) : "");
function clean(row: Record<string, unknown>): Experiment {
  const {
    owner_hash: _,
    fingerprint: __,
    outcome_hash: ___,
    search_vector: ____,
    accessible_campaign_id,
    ...record
  } = row;
  const yes = Number(row.reproduced_count || 0),
    no = Number(row.not_reproduced_count || 0),
    uncertain = Number(row.inconclusive_count || 0),
    technical = Number(row.technical_failure_count || 0),
    unable = Number(row.unable_to_assess_count || 0);
  return {
    ...record,
    reproducing_agent_count: Number(row.reproducing_agent_count || 0),
    not_reproducing_agent_count: Number(row.not_reproducing_agent_count || 0),
    reproduced_count: yes,
    not_reproduced_count: no,
    inconclusive_count: uncertain,
    technical_failure_count: technical,
    unable_to_assess_count: unable,
    campaign_id: (accessible_campaign_id as string) || null,
    reproduction_status:
      yes && no
        ? "mixed"
        : no
          ? "not_reproduced"
          : yes
            ? "reproduced"
            : uncertain || technical || unable
              ? "inconclusive"
              : "unreviewed",
  } as Experiment;
}
export async function searchExperiments(
  input: z.input<typeof searchSchema> = {},
) {
  const p = searchSchema.parse(input),
    sql = db();
  const rows =
    await sql`SELECT e.*,s.reproduced_count,s.not_reproduced_count,s.inconclusive_count,s.technical_failure_count,s.unable_to_assess_count,
 (SELECT count(DISTINCT coalesce(re.owner_hash,r.owner_hash))::int FROM reproduction_reports r LEFT JOIN experiments re ON re.id=r.reproduction_id WHERE r.experiment_id=e.id AND r.result='reproduced' AND coalesce(re.visibility,r.visibility)='public') AS reproducing_agent_count,
 (SELECT count(DISTINCT coalesce(re.owner_hash,r.owner_hash))::int FROM reproduction_reports r LEFT JOIN experiments re ON re.id=r.reproduction_id WHERE r.experiment_id=e.id AND r.result='not_reproduced' AND coalesce(re.visibility,r.visibility)='public') AS not_reproducing_agent_count,
 (SELECT c.id FROM campaigns c WHERE c.id=e.campaign_id AND (c.visibility='public' OR c.owner_hash=${ownerHash(p.access_token)})) AS accessible_campaign_id,
 (SELECT c.title FROM campaigns c WHERE c.id=e.campaign_id AND (c.visibility='public' OR c.owner_hash=${ownerHash(p.access_token)})) AS campaign_title
 FROM experiments e LEFT JOIN public_reproduction_summary s ON s.experiment_id=e.id WHERE ((visibility='public' AND ${p.scope}<>'owned') OR owner_hash=${ownerHash(p.access_token)})
 AND (${p.query}='' OR search_vector @@ websearch_to_tsquery('english',${p.query}) OR title ILIKE ${"%" + p.query + "%"} OR question ILIKE ${"%" + p.query + "%"} OR ${p.query.toLowerCase()}=ANY(tags))
 AND (${p.tag}='' OR ${p.tag}=ANY(tags)) AND (${p.status || ""}='' OR status=${p.status || ""}) AND (${p.outcome || ""}='' OR outcome=${p.outcome || ""})
 ORDER BY CASE WHEN ${p.query}='' THEN 0 ELSE ts_rank(search_vector,websearch_to_tsquery('english',${p.query})) END DESC,created_at DESC LIMIT ${p.limit} OFFSET ${p.offset}`;
  return rows.map(clean);
}
export async function getExperiment(id: string, token?: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const sql = db();
  const rows = await sql`SELECT e.*,
 (SELECT c.id FROM campaigns c WHERE c.id=e.campaign_id AND (c.visibility='public' OR c.owner_hash=${ownerHash(token)})) AS accessible_campaign_id,
 (SELECT c.title FROM campaigns c WHERE c.id=e.campaign_id AND (c.visibility='public' OR c.owner_hash=${ownerHash(token)})) AS campaign_title
 FROM experiments e WHERE id=${id} AND (visibility='public' OR owner_hash=${ownerHash(token)})`;
  if (!rows[0]) return null;
  const reports =
    await sql`SELECT r.id,r.experiment_id,r.reproduction_id,r.result,r.observations,r.evidence,r.differences,r.created_at,e.title AS reproduction_title,coalesce(e.owner_hash,r.owner_hash) AS report_owner_key,coalesce(e.agent,r.agent) AS agent,coalesce(e.conditions,r.conditions) AS conditions,coalesce(e.visibility,r.visibility) AS visibility FROM reproduction_reports r LEFT JOIN experiments e ON e.id=r.reproduction_id WHERE r.experiment_id=${id} AND (coalesce(e.visibility,r.visibility)='public' OR coalesce(e.owner_hash,r.owner_hash)=${ownerHash(token)}) ORDER BY r.created_at DESC`;
  return {
    ...clean({
      ...rows[0],
      reproducing_agent_count: new Set(
        reports
          .filter((r) => r.result === "reproduced")
          .map((r) => r.report_owner_key)
          .filter(Boolean),
      ).size,
      not_reproducing_agent_count: new Set(
        reports
          .filter((r) => r.result === "not_reproduced")
          .map((r) => r.report_owner_key)
          .filter(Boolean),
      ).size,
      reproduced_count: reports.filter((r) => r.result === "reproduced").length,
      not_reproduced_count: reports.filter((r) => r.result === "not_reproduced")
        .length,
      inconclusive_count: reports.filter((r) => r.result === "inconclusive")
        .length,
      technical_failure_count: reports.filter(
        (r) => r.result === "technical_failure",
      ).length,
      unable_to_assess_count: reports.filter(
        (r) => r.result === "unable_to_assess",
      ).length,
    }),
    reproductions: reports.map(
      ({ report_owner_key, ...report }) => report,
    ) as ReproductionReport[],
  };
}
export async function quota(identity: string) {
  const key = hash(
    (process.env.RATE_LIMIT_SALT || "fixrelay") + "experiment:" + identity,
  );
  const rows =
    await db()`INSERT INTO write_quotas(key,window_start,count) VALUES (${key},date_trunc('hour',now()),1) ON CONFLICT(key,window_start) DO UPDATE SET count=write_quotas.count+1 WHERE write_quotas.count<60 RETURNING count`;
  if (!rows.length)
    throw new ExperimentError(
      "Experiment write limit reached (60/hour). Try later.",
    );
}
export async function registerExperiment(
  input: z.input<typeof registerSchema>,
  identity: string,
) {
  const p = registerSchema.parse(input);
  if (Boolean(p.replication_of) !== Boolean(p.replication_reason))
    throw new ExperimentError(
      "Provide both replication_of and replication_reason for an intentional repeat.",
    );
  const token = p.access_token || randomBytes(32).toString("base64url"),
    owner = ownerHash(token);
  if (p.parents.length && !p.campaign_id)
    throw new ExperimentError("Parent links require a campaign_id.");
  if (p.campaign_id) {
    const campaign =
      await db()`SELECT id FROM campaigns WHERE id=${p.campaign_id} AND owner_hash=${owner}`;
    if (!campaign[0])
      throw new ExperimentError(
        "Campaign inaccessible. Supply its project access_token.",
      );
  }
  if (p.replication_of) {
    const source = await getExperiment(p.replication_of, token);
    if (!source)
      throw new ExperimentError(
        "Replication source not found or inaccessible.",
      );
    if (p.visibility === "public" && source.visibility === "private")
      throw new ExperimentError(
        "Publish the source experiment before linking to it publicly.",
      );
  }
  const fingerprint = hash(
    JSON.stringify(
      [
        p.title,
        p.question,
        p.hypothesis,
        p.method,
        p.inputs,
        p.conditions,
        p.success_criteria,
        p.replication_of || "",
        p.replication_reason || "",
        ...(p.campaign_id ? [p.campaign_id, JSON.stringify(p.parents)] : []),
      ].map((s) => s.replace(/\s+/g, " ").trim()),
    ),
  );
  const sql = db();
  const existing =
    await sql`SELECT id,visibility FROM experiments WHERE owner_hash=${owner} AND fingerprint=${fingerprint}`;
  if (existing[0])
    return {
      id: existing[0].id as string,
      visibility: existing[0].visibility,
      duplicate: true,
      access_token: token,
    };
  await quota(identity);
  const statements = [
    sql`INSERT INTO experiments(title,question,hypothesis,method,inputs,conditions,success_criteria,tags,agent,visibility,owner_hash,fingerprint,replication_of,replication_reason,campaign_id)
 VALUES (${p.title},${p.question},${p.hypothesis},${p.method},${p.inputs},${p.conditions},${p.success_criteria},${p.tags},${p.agent},${p.visibility},${owner},${fingerprint},${p.replication_of || null},${p.replication_reason || null},${p.campaign_id || null}) ON CONFLICT(owner_hash,fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint RETURNING id`,
  ];
  for (const parent of p.parents)
    statements.push(
      sql`SELECT link_campaign_experiments(${p.campaign_id}::uuid,${parent.id}::uuid,(SELECT id FROM experiments WHERE owner_hash=${owner} AND fingerprint=${fingerprint}),${owner},${parent.relation},${parent.reason})`,
    );
  let rows;
  try {
    [rows] = await sql.transaction(statements);
  } catch (e) {
    if (e instanceof Error && /campaign|Both experiments|cycle/.test(e.message))
      throw new ExperimentError(
        "Invalid campaign parent link; registration was rolled back.",
      );
    throw e;
  }
  const record =
    rows[0] ||
    (
      await sql`SELECT id FROM experiments WHERE owner_hash=${owner} AND fingerprint=${fingerprint}`
    )[0];
  return {
    id: record.id as string,
    visibility: p.visibility,
    duplicate: !rows.length,
    access_token: token,
  };
}
export async function startExperiment(
  id: string,
  token: string,
  identity: string,
) {
  z.string().uuid().parse(id);
  accessTokenSchema.parse(token);
  await quota(identity);
  const sql = db();
  const rows =
    await sql`UPDATE experiments SET status='running',started_at=coalesce(started_at,now()) WHERE id=${id} AND owner_hash=${ownerHash(token)} AND status IN ('planned','running') RETURNING id,status,started_at`;
  if (!rows[0])
    throw new ExperimentError("Experiment inaccessible or already finished.");
  return rows[0];
}
export async function recordOutcome(
  input: z.input<typeof outcomeSchema>,
  identity: string,
) {
  const p = outcomeSchema.parse(input),
    sql = db(),
    owner = ownerHash(p.access_token);
  const digest = hash(
    JSON.stringify([
      p.outcome,
      p.observations,
      p.evidence,
      p.limitations,
      p.metrics,
      p.artifacts,
    ]),
  );
  const existing =
    await sql`SELECT id,outcome_hash FROM experiments WHERE id=${p.id} AND owner_hash=${owner}`;
  if (!existing[0])
    throw new ExperimentError(
      "Experiment inaccessible. Check the ID and access token.",
    );
  if (existing[0].outcome_hash === digest) return { id: p.id, duplicate: true };
  if (existing[0].outcome_hash)
    throw new ExperimentError(
      "An outcome is already recorded. Register a linked replication to investigate further.",
    );
  await quota(identity);
  const rows =
    await sql`UPDATE experiments SET status=${p.outcome === "cancelled" ? "cancelled" : "completed"},outcome=${p.outcome},observations=${p.observations},evidence=${p.evidence},limitations=${p.limitations},metrics=${JSON.stringify(p.metrics)}::jsonb,artifacts=${JSON.stringify(p.artifacts)}::jsonb,outcome_hash=${digest},completed_at=now()
 WHERE id=${p.id} AND owner_hash=${owner} AND outcome_hash IS NULL RETURNING id,status,outcome`;
  if (!rows.length) {
    const concurrent =
      await sql`SELECT outcome_hash FROM experiments WHERE id=${p.id} AND owner_hash=${owner}`;
    if (concurrent[0]?.outcome_hash === digest)
      return { id: p.id, duplicate: true };
    throw new ExperimentError(
      "Another outcome was recorded concurrently. Read the experiment before retrying.",
    );
  }
  return { ...rows[0], duplicate: false };
}
export async function experimentStats() {
  const sql = db();
  const [counts, tags] = await Promise.all([
    sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE status IN ('planned','running'))::int AS active,count(*) FILTER(WHERE status='completed')::int AS completed,count(*) FILTER(WHERE replication_of IS NOT NULL)::int AS replications FROM experiments WHERE visibility='public'`,
    sql`SELECT tag,count(*)::int AS count FROM experiments CROSS JOIN unnest(tags) tag WHERE visibility='public' GROUP BY tag ORDER BY count DESC,tag LIMIT 12`,
  ]);
  return { ...counts[0], tags } as {
    total: number;
    active: number;
    completed: number;
    replications: number;
    tags: { tag: string; count: number }[];
  };
}
export async function publishExperiment(
  id: string,
  token: string,
  identity: string,
) {
  z.string().uuid().parse(id);
  accessTokenSchema.parse(token);
  const sql = db();
  const rows =
    await sql`SELECT id,replication_of FROM experiments WHERE id=${id} AND owner_hash=${ownerHash(token)}`;
  if (!rows[0])
    throw new ExperimentError(
      "Experiment inaccessible. Check the ID and access token.",
    );
  if (rows[0].replication_of) {
    const parent = await getExperiment(rows[0].replication_of as string);
    if (!parent)
      throw new ExperimentError(
        "Publish the source experiment before linking to it publicly.",
      );
  }
  await quota(identity);
  await sql`UPDATE experiments SET visibility='public' WHERE id=${id} AND owner_hash=${ownerHash(token)}`;
  return { id, visibility: "public" };
}
export async function submitReproduction(
  input: z.input<typeof reproductionSchema>,
  identity: string,
) {
  return (await import("./reproductions")).submit(input, identity);
}
