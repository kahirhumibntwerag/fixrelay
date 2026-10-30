import { createHash, createHmac, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { getAuthPool } from "./auth";
import type { Principal } from "./auth-access";
import { compatibleObservation, metricProgress } from "./research-metrics";

const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(6000);
const short = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(6000).default("");
const json = z
  .record(z.string().max(100), z.json())
  .refine(
    (v) => JSON.stringify(v).length <= 12000,
    "Configuration is limited to 12,000 characters",
  );
const evidence = z.array(uuid).min(1).max(30);
const scoped = { campaign_id: uuid };
const reviewFields = {
  ...scoped,
  experiment_id: uuid.optional(),
  proposed_action: text,
  rationale: text,
  evidence_ids: z.array(uuid).max(30).default([]),
  impact: optionalText,
  costs: optionalText,
};
export const researchSchemas = {
  create_campaign: z.object({
    title: short.min(4),
    question: text.min(10),
    summary: text.min(10),
    objective: text,
    constraints: optionalText,
    stop_conditions: optionalText,
    metric: z.object({
      name: short,
      unit: z.string().max(80).default(""),
      direction: z.enum(["maximize", "minimize", "range"]),
      baseline: z.number().finite().optional(),
      target: z.number().finite(),
      target_max: z.number().finite().optional(),
      evaluation_protocol: text,
    }),
  }),
  claim_campaign: z.object({
    ...scoped,
    access_token: z.string().min(24).max(200),
  }),
  publish_campaign: z.object({
    ...scoped,
    experiment_ids: z.array(uuid).min(1).max(100),
  }),
  submit_reproduction: z.object({
    ...scoped,
    target_experiment_id: uuid,
    result: z.enum(["reproduced", "not_reproduced", "unable_to_assess"]),
    observations: text,
    evidence: text,
    conditions: text,
    differences: text,
    visibility: z.enum(["private", "public"]).default("private"),
  }),
  create_hypothesis: z.object({
    ...scoped,
    title: short,
    statement: text,
    rationale: text,
    prediction: text,
    parent_hypothesis_id: uuid.optional(),
    relationship: z
      .enum(["derived_from", "revision_of", "alternative_to", "motivated_by"])
      .default("derived_from"),
  }),
  propose_experiment: z.object({
    ...scoped,
    hypothesis_id: uuid,
    title: short,
    method: text,
    inputs: text,
    conditions: text,
    success_criteria: text,
    failure_criteria: optionalText,
    variables: json.default({}),
    controls: json.default({}),
    expected_outcome: optionalText,
    parent_experiment_id: uuid.optional(),
    relation: z
      .enum(["follow_up", "refinement", "replication", "dependency"])
      .default("follow_up"),
    reason: optionalText,
    requires_approval: z.boolean().default(false),
  }),
  start_experiment_run: z.object({
    ...scoped,
    experiment_id: uuid,
    configuration: json.default({}),
    task: optionalText,
    next_action: optionalText,
  }),
  report_run_progress: z.object({
    ...scoped,
    run_id: uuid,
    progress: z.number().int().min(0).max(100),
    task: text,
    next_action: optionalText,
  }),
  complete_experiment_run: z.object({
    ...scoped,
    run_id: uuid,
    status: z.enum(["completed", "failed", "cancelled"]),
    outcome: z
      .enum([
        "supported",
        "not_supported",
        "inconclusive",
        "technical_failure",
        "cancelled",
      ])
      .optional(),
    summary: text,
  }),
  record_observation: z.object({
    ...scoped,
    run_id: uuid,
    metric_id: uuid.optional(),
    value: z.number().finite().optional(),
    unit: z.string().max(80).default(""),
    qualitative: optionalText,
    sample_size: z.number().int().positive().max(1000000000).optional(),
    uncertainty: optionalText,
    evidence: text,
    conditions_key: text,
    supersedes_id: uuid.optional(),
  }),
  record_analysis: z.object({
    ...scoped,
    experiment_id: uuid,
    interpretation: text,
    comparison: optionalText,
    limitations: text,
    uncertainty: optionalText,
    confounders: optionalText,
    alternative_explanations: optionalText,
    conclusive: z.boolean().default(false),
    evidence_ids: evidence,
    supersedes_id: uuid.optional(),
  }),
  record_scientific_decision: z.object({
    ...scoped,
    hypothesis_id: uuid,
    experiment_id: uuid,
    outcome: z.enum(["supported", "contradicted", "inconclusive"]),
    rationale: text,
    next_action: text,
    evidence_ids: evidence,
    next_hypothesis_id: uuid.optional(),
    supersedes_id: uuid.optional(),
  }),
  propose_next_step: z.object({
    ...reviewFields,
    requires_approval: z.boolean().default(true),
  }),
  request_human_review: z.object(reviewFields),
  review_request: z.object({
    ...scoped,
    review_id: uuid,
    decision: z.enum(["approved", "rejected"]),
    feedback: optionalText,
  }),
  record_artifact: z.object({
    ...scoped,
    run_id: uuid,
    type: short,
    url: z
      .string()
      .url()
      .max(2000)
      .refine((v) => v.startsWith("https://"), "Artifacts require HTTPS"),
    checksum: z.string().regex(/^[a-fA-F0-9]{64}$/, "Use a SHA-256 checksum"),
    version: short,
    metadata: json.default({}),
  }),
};
export type ResearchAction = keyof typeof researchSchemas;
export class ResearchError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError)
    return Response.json(
      {
        error: "Invalid input",
        issues: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  const status =
    error instanceof Error && "status" in error ? Number(error.status) : 500;
  return Response.json(
    {
      error:
        status < 500 && error instanceof Error
          ? error.message
          : "Research service unavailable. Please retry.",
    },
    { status },
  );
}
type Queryable = Pick<PoolClient, "query">;
export async function assertCampaignAccess(
  sql: Queryable,
  campaignId: string,
  principal: Principal,
  write = false,
) {
  if (!uuid.safeParse(campaignId).success)
    throw new ResearchError("Invalid campaign ID");
  if (
    principal.kind === "agent" &&
    principal.campaignId &&
    principal.campaignId !== campaignId
  )
    throw new ResearchError(
      "Agent credential is scoped to a different campaign",
      403,
    );
  const { rows } = await sql.query(
    "SELECT role FROM research_campaign_members WHERE campaign_id=$1 AND user_id=$2",
    [campaignId, principal.userId],
  );
  if (!rows[0] || (write && rows[0].role === "viewer"))
    throw new ResearchError("Campaign not found or access denied", 403);
  return rows[0].role as string;
}
async function entity(
  sql: Queryable,
  table:
    | "research_hypotheses"
    | "experiments"
    | "research_runs"
    | "research_reviews"
    | "research_observations"
    | "research_analyses"
    | "research_decisions",
  id: string,
  campaignId: string,
) {
  const clause =
    table === "research_runs"
      ? "JOIN experiments e ON e.id=t.experiment_id WHERE t.id=$1 AND e.campaign_id=$2"
      : table === "research_observations"
        ? "JOIN research_runs r ON r.id=t.run_id JOIN experiments e ON e.id=r.experiment_id WHERE t.id=$1 AND e.campaign_id=$2"
        : table === "research_analyses" || table === "research_decisions"
          ? "JOIN experiments e ON e.id=t.experiment_id WHERE t.id=$1 AND e.campaign_id=$2"
          : "WHERE t.id=$1 AND t.campaign_id=$2";
  const { rows } = await sql.query(`SELECT t.* FROM ${table} t ${clause}`, [
    id,
    campaignId,
  ]);
  if (!rows[0])
    throw new ResearchError(
      "Referenced entity does not belong to this campaign",
      404,
    );
  return rows[0];
}
async function checkEvidence(
  sql: Queryable,
  ids: string[],
  campaignId: string,
  experimentId?: string,
) {
  for (const id of ids) {
    const observation = await entity(
      sql,
      "research_observations",
      id,
      campaignId,
    );
    if (experimentId) {
      const run = await entity(
        sql,
        "research_runs",
        observation.run_id,
        campaignId,
      );
      if (run.experiment_id !== experimentId)
        throw new ResearchError(
          "Evidence must belong to the experiment being interpreted",
        );
    }
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function mutateResearch(
  action: string,
  input: unknown,
  principal: Principal,
  idempotencyKey: string,
) {
  if (!Object.hasOwn(researchSchemas, action))
    throw new ResearchError("Unknown research action");
  const key = z.string().min(8).max(160).parse(idempotencyKey);
  // All fields are schema validated before entering the transactional command handler.
  const p = researchSchemas[action as ResearchAction].parse(input) as Record<
    string,
    any
  >;
  if (action === "review_request" && principal.kind !== "human")
    throw new ResearchError(
      "Only a signed-in human researcher can approve or reject reviews",
      403,
    );
  if (action === "publish_campaign" && principal.kind !== "human")
    throw new ResearchError(
      "Only a signed-in human owner can publish private findings",
      403,
    );
  if (
    (action === "create_campaign" || action === "claim_campaign") &&
    principal.kind === "agent" &&
    principal.campaignId
  )
    throw new ResearchError(
      "Use a workspace credential to create campaigns",
      403,
    );
  const fingerprint = createHash("sha256")
    .update(canonical([action, p]))
    .digest("hex");
  const sql = await getAuthPool().connect();
  try {
    await sql.query("BEGIN");
    await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      principal.userId + ":" + key,
    ]);
    if (action !== "create_campaign" && action !== "claim_campaign") {
      const role = await assertCampaignAccess(
        sql,
        p.campaign_id,
        principal,
        true,
      );
      if (action === "publish_campaign" && role !== "owner")
        throw new ResearchError("Only the campaign owner may publish it", 403);
    }
    const previous = await sql.query(
      "SELECT fingerprint,response FROM research_mutations WHERE user_id=$1 AND idempotency_key=$2",
      [principal.userId, key],
    );
    if (previous.rows[0]) {
      if (previous.rows[0].fingerprint !== fingerprint)
        throw new ResearchError(
          "Idempotency key was already used for different input",
          409,
        );
      const response = previous.rows[0].response;
      if (
        principal.kind === "agent" &&
        principal.campaignId &&
        response.campaign_id !== principal.campaignId
      )
        throw new ResearchError(
          "Credential scope does not allow this result",
          403,
        );
      await sql.query("COMMIT");
      return response;
    }
    const limit = await sql.query(
      `INSERT INTO write_quotas(key,window_start,count) VALUES($1,date_trunc('hour',now()),1)
      ON CONFLICT(key,window_start) DO UPDATE SET count=write_quotas.count+1 RETURNING count`,
      ["research:" + principal.userId],
    );
    if (limit.rows[0].count > 1500)
      throw new ResearchError("Hourly research write limit reached", 429);
    let campaignId = p.campaign_id as string;
    if (action === "submit_reproduction") {
      const target = await sql.query(
        "SELECT campaign_id FROM experiments WHERE id=$1 AND visibility='public'",
        [p.target_experiment_id],
      );
      const lockIds = [
        campaignId,
        ...(target.rows[0]?.campaign_id ? [target.rows[0].campaign_id] : []),
      ].sort();
      await sql.query(
        "SELECT id FROM campaigns WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [lockIds],
      );
    } else if (action !== "create_campaign")
      await sql.query("SELECT id FROM campaigns WHERE id=$1 FOR UPDATE", [
        campaignId,
      ]);
    let result: Record<string, unknown> = {};
    let description = "";
    let entityId = campaignId;
    if (action === "create_campaign") {
      if (
        p.metric.direction === "range" &&
        (p.metric.target_max === undefined ||
          p.metric.target_max < p.metric.target)
      )
        throw new ResearchError(
          "Range goals require target_max greater than or equal to target",
        );
      const owner = createHash("sha256").update(randomBytes(32)).digest("hex");
      const { rows } = await sql.query(
        `INSERT INTO campaigns(title,question,summary,objective,constraints,stop_conditions,owner_hash,fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          p.title,
          p.question,
          p.summary,
          p.objective,
          p.constraints,
          p.stop_conditions,
          owner,
          fingerprint,
        ],
      );
      campaignId = rows[0].id;
      entityId = campaignId;
      await sql.query(
        `INSERT INTO research_campaign_members(campaign_id,user_id,role) VALUES($1,$2,'owner')`,
        [campaignId, principal.userId],
      );
      const metric = await sql.query(
        `INSERT INTO research_metrics(campaign_id,name,unit,direction,baseline,target,target_max,evaluation_protocol)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          campaignId,
          p.metric.name,
          p.metric.unit,
          p.metric.direction,
          p.metric.baseline ?? null,
          p.metric.target,
          p.metric.target_max ?? null,
          p.metric.evaluation_protocol,
        ],
      );
      result = {
        id: campaignId,
        metric_id: metric.rows[0].id,
        visibility: "private",
      };
      description = "Research campaign created: " + p.title;
    } else if (action === "claim_campaign") {
      if (principal.kind !== "human")
        throw new ResearchError(
          "Only humans can import a legacy campaign",
          403,
        );
      const legacy = await sql.query(
        "SELECT owner_hash FROM campaigns WHERE id=$1",
        [campaignId],
      );
      // Legacy ownerHash uses the registry hash function. Never trust visibility as ownership.
      const { ownerHash: legacyHash } = await import("./experiments");
      if (
        !legacy.rows[0] ||
        legacy.rows[0].owner_hash !== legacyHash(p.access_token)
      )
        throw new ResearchError("Invalid legacy campaign access token", 403);
      const existing = await sql.query(
        "SELECT user_id FROM research_campaign_members WHERE campaign_id=$1",
        [campaignId],
      );
      if (
        existing.rows.length &&
        !existing.rows.some((r) => r.user_id === principal.userId)
      )
        throw new ResearchError(
          "Campaign is already linked to another account",
          409,
        );
      await sql.query(
        `INSERT INTO research_campaign_members(campaign_id,user_id,role) VALUES($1,$2,'owner') ON CONFLICT DO NOTHING`,
        [campaignId, principal.userId],
      );
      result = { id: campaignId };
      description = "Legacy registry campaign linked to researcher account";
    } else if (action === "publish_campaign") {
      for (const id of [...new Set(p.experiment_ids as string[])]) {
        const experiment = await entity(sql, "experiments", id, campaignId);
        if (experiment.status !== "completed")
          throw new ResearchError(
            "Only completed experiments can be shared",
            409,
          );
        const observations = (
          await sql.query(
            `SELECT o.*,m.name AS metric_name,m.evaluation_protocol,m.unit AS metric_unit,r.status AS run_status FROM research_observations o JOIN research_runs r ON r.id=o.run_id LEFT JOIN research_metrics m ON m.id=o.metric_id
          WHERE r.experiment_id=$1 AND NOT EXISTS(SELECT 1 FROM research_observations c WHERE c.supersedes_id=o.id) ORDER BY o.created_at,o.id`,
            [id],
          )
        ).rows;
        const analyses = (
          await sql.query(
            "SELECT * FROM research_analyses WHERE experiment_id=$1 ORDER BY created_at DESC,id DESC",
            [id],
          )
        ).rows;
        const metrics = observations
          .filter(
            (o) =>
              o.value !== null &&
              o.metric_name &&
              o.run_status === "completed" &&
              o.conditions_key === o.evaluation_protocol &&
              o.unit === o.metric_unit,
          )
          .map((o) => ({ name: o.metric_name, value: o.value, unit: o.unit }));
        const publishedObservations = observations
          .map((o) =>
            [
              o.value !== null
                ? `${o.metric_name || "Measurement"}: ${o.value} ${o.unit}`
                : "Qualitative observation",
              o.qualitative,
              `Conditions: ${o.conditions_key}`,
              `Sample size: ${o.sample_size ?? "not reported"}. Uncertainty: ${o.uncertainty || "not reported"}`,
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n");
        await sql.query(
          `UPDATE experiments SET visibility='public',observations=$2,evidence=$3,limitations=$4,metrics=$5 WHERE id=$1`,
          [
            id,
            publishedObservations,
            observations.map((o) => o.evidence).join("\n"),
            analyses[0]?.limitations ||
              "No analysis limitations were recorded.",
            JSON.stringify(metrics),
          ],
        );
      }
      await sql.query(`UPDATE campaigns SET visibility='public' WHERE id=$1`, [
        campaignId,
      ]);
      result = {
        id: campaignId,
        visibility: "public",
        published_experiment_ids: p.experiment_ids,
      };
      description =
        "Researcher published selected findings to the shared campaign registry";
    } else if (action === "submit_reproduction") {
      const target = await sql.query(
        `SELECT id,campaign_id,status FROM experiments WHERE id=$1 AND visibility='public'`,
        [p.target_experiment_id],
      );
      if (!target.rows[0] || target.rows[0].status !== "completed")
        throw new ResearchError(
          "Reproduction target must be a public completed experiment",
          404,
        );
      const related = await sql.query(
        "SELECT user_id FROM research_campaign_members WHERE campaign_id=$1 AND user_id=$2",
        [target.rows[0].campaign_id, principal.userId],
      );
      if (related.rows.length)
        throw new ResearchError(
          "A campaign collaborator cannot submit an independent reproduction of their own campaign",
          403,
        );
      if (!process.env.BETTER_AUTH_SECRET)
        throw new ResearchError(
          "Authentication must be configured for reproduction reports",
          503,
        );
      const owner = createHmac("sha256", process.env.BETTER_AUTH_SECRET)
        .update("reproducer:" + principal.userId)
        .digest("hex");
      const digest = createHash("sha256")
        .update(
          canonical([
            p.target_experiment_id,
            p.result,
            p.observations,
            p.evidence,
            p.conditions,
            p.differences,
            p.visibility,
          ]),
        )
        .digest("hex");
      const { rows } = await sql.query(
        `INSERT INTO reproduction_reports(experiment_id,result,observations,evidence,conditions,differences,report_hash,owner_hash,agent,visibility)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(owner_hash,report_hash) DO UPDATE SET report_hash=EXCLUDED.report_hash RETURNING id`,
        [
          p.target_experiment_id,
          p.result,
          p.observations,
          p.evidence,
          p.conditions,
          p.differences,
          digest,
          owner,
          principal.name,
          p.visibility,
        ],
      );
      result = {
        id: rows[0].id,
        target_experiment_id: p.target_experiment_id,
        visibility: p.visibility,
        result: p.result,
        independence:
          "Separate account; institutional independence and execution remain unverified",
      };
      description = "Reproduction report recorded: " + p.result;
      if (
        p.visibility === "public" &&
        target.rows[0].campaign_id &&
        target.rows[0].campaign_id !== campaignId
      )
        await sql.query(
          `INSERT INTO research_events(campaign_id,entity_id,event_type,actor,actor_user_id,description,payload) VALUES($1,$2,'reproduction_received',$3,$4,$5,$6)`,
          [
            target.rows[0].campaign_id,
            rows[0].id,
            principal.name,
            principal.userId,
            "An independent account reported " + p.result,
            JSON.stringify({
              target_experiment_id: p.target_experiment_id,
              report_id: rows[0].id,
            }),
          ],
        );
    } else if (action === "create_hypothesis") {
      if (p.parent_hypothesis_id)
        await entity(
          sql,
          "research_hypotheses",
          p.parent_hypothesis_id,
          campaignId,
        );
      const { rows } = await sql.query(
        `INSERT INTO research_hypotheses(campaign_id,parent_hypothesis_id,relationship,title,statement,rationale,prediction,agent)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          campaignId,
          p.parent_hypothesis_id ?? null,
          p.relationship,
          p.title,
          p.statement,
          p.rationale,
          p.prediction,
          principal.name,
        ],
      );
      result = { id: rows[0].id };
      description = "Hypothesis proposed: " + p.title;
    } else if (action === "propose_experiment") {
      const hypothesis = await entity(
        sql,
        "research_hypotheses",
        p.hypothesis_id,
        campaignId,
      );
      if (p.parent_experiment_id)
        await entity(sql, "experiments", p.parent_experiment_id, campaignId);
      const campaign = await sql.query(
        "SELECT owner_hash,question FROM campaigns WHERE id=$1",
        [campaignId],
      );
      const { rows } = await sql.query(
        `INSERT INTO experiments(campaign_id,hypothesis_id,title,question,hypothesis,method,inputs,conditions,success_criteria,tags,agent,owner_hash,fingerprint,variables,controls,expected_outcome)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'{}',$10,$11,$12,$13,$14,$15) RETURNING id`,
        [
          campaignId,
          p.hypothesis_id,
          p.title,
          campaign.rows[0].question,
          hypothesis.statement,
          p.method,
          p.inputs,
          p.conditions,
          p.success_criteria +
            (p.failure_criteria
              ? "\nFailure criteria: " + p.failure_criteria
              : ""),
          principal.name,
          campaign.rows[0].owner_hash,
          fingerprint,
          JSON.stringify(p.variables),
          JSON.stringify(p.controls),
          p.expected_outcome,
        ],
      );
      const id = rows[0].id;
      if (p.parent_experiment_id)
        await sql.query(
          `INSERT INTO experiment_links(campaign_id,parent_id,child_id,relation,reason) VALUES($1,$2,$3,$4,$5)`,
          [
            campaignId,
            p.parent_experiment_id,
            id,
            p.relation,
            p.reason || "Follow-up experiment registered",
          ],
        );
      if (p.requires_approval)
        await sql.query(
          `INSERT INTO research_reviews(campaign_id,experiment_id,proposed_action,rationale,requested_by) VALUES($1,$2,$3,$4,$5)`,
          [
            campaignId,
            id,
            "Start experiment: " + p.title,
            "Agent requested researcher approval before execution",
            principal.name,
          ],
        );
      result = {
        id,
        hypothesis_id: p.hypothesis_id,
        awaiting_approval: p.requires_approval,
      };
      description = "Experiment designed: " + p.title;
    } else if (action === "start_experiment_run") {
      const experiment = await entity(
        sql,
        "experiments",
        p.experiment_id,
        campaignId,
      );
      if (experiment.status === "cancelled")
        throw new ResearchError("Cancelled experiments cannot start runs", 409);
      const pending = await sql.query(
        `SELECT id,status FROM research_reviews WHERE experiment_id=$1 AND status<>'approved'`,
        [p.experiment_id],
      );
      if (pending.rows.length)
        throw new ResearchError(
          "Researcher approval is required before this experiment can run",
          409,
        );
      const { rows } = await sql.query(
        `INSERT INTO research_runs(experiment_id,agent,agent_key_id,configuration,task,next_action) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          p.experiment_id,
          principal.name,
          principal.keyId ?? null,
          JSON.stringify(p.configuration),
          p.task,
          p.next_action,
        ],
      );
      await sql.query(
        `UPDATE experiments SET status='running',started_at=coalesce(started_at,now()),completed_at=NULL WHERE id=$1`,
        [p.experiment_id],
      );
      if (experiment.hypothesis_id)
        await sql.query(
          `UPDATE research_hypotheses SET status='testing' WHERE id=$1 AND status='untested'`,
          [experiment.hypothesis_id],
        );
      result = {
        id: rows[0].id,
        run_id: rows[0].id,
        experiment_id: p.experiment_id,
      };
      description = "Experiment run started";
    } else if (
      action === "report_run_progress" ||
      action === "complete_experiment_run"
    ) {
      const run = await entity(sql, "research_runs", p.run_id, campaignId);
      if (run.status !== "running")
        throw new ResearchError(
          "Only running runs can report progress or complete",
          409,
        );
      if (
        principal.kind === "agent" &&
        run.agent_key_id &&
        run.agent_key_id !== principal.keyId
      )
        throw new ResearchError(
          "Only the agent that started this run may update it",
          403,
        );
      if (action === "report_run_progress") {
        if (p.progress < run.progress)
          throw new ResearchError("Run progress cannot go backwards", 409);
        await sql.query(
          "UPDATE research_runs SET progress=$2,task=$3,next_action=$4,last_heartbeat_at=now() WHERE id=$1",
          [p.run_id, p.progress, p.task, p.next_action],
        );
        description = p.task;
      } else {
        const outcome =
          p.status === "failed"
            ? "technical_failure"
            : p.status === "cancelled"
              ? "cancelled"
              : (p.outcome ?? "inconclusive");
        if (
          p.status === "completed" &&
          ["technical_failure", "cancelled"].includes(outcome)
        )
          throw new ResearchError(
            "Use failed or cancelled execution status for technical failures or cancellation",
          );
        await sql.query(
          `UPDATE research_runs SET status=$2,summary=$3,outcome=$4,progress=CASE WHEN $2='completed' THEN 100 ELSE progress END,completed_at=now(),last_heartbeat_at=now() WHERE id=$1`,
          [p.run_id, p.status, p.summary, outcome],
        );
        const active = await sql.query(
          `SELECT id FROM research_runs WHERE experiment_id=$1 AND status='running'`,
          [run.experiment_id],
        );
        if (!active.rows.length)
          await sql.query(
            `UPDATE experiments SET status='completed',outcome=$2,completed_at=now() WHERE id=$1`,
            [run.experiment_id, outcome],
          );
        description = "Run " + p.status + ": " + p.summary;
      }
      result = { id: p.run_id, run_id: p.run_id };
    } else if (action === "record_observation") {
      const run = await entity(sql, "research_runs", p.run_id, campaignId);
      if (p.value === undefined && !p.qualitative)
        throw new ResearchError(
          "An observation needs a measured value or qualitative observation",
        );
      if (p.metric_id) {
        const metric = await sql.query(
          "SELECT * FROM research_metrics WHERE id=$1 AND campaign_id=$2",
          [p.metric_id, campaignId],
        );
        if (!metric.rows[0])
          throw new ResearchError("Metric is not defined in this campaign");
        if (p.unit !== metric.rows[0].unit)
          throw new ResearchError(
            "Observation unit differs from the registered metric",
          );
      }
      if (p.supersedes_id) {
        const previous = await entity(
          sql,
          "research_observations",
          p.supersedes_id,
          campaignId,
        );
        if (previous.run_id !== run.id)
          throw new ResearchError("Correction must refer to the same run");
      }
      const { rows } = await sql.query(
        `INSERT INTO research_observations(run_id,metric_id,value,unit,qualitative,sample_size,uncertainty,evidence,conditions_key,supersedes_id,agent)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          p.run_id,
          p.metric_id ?? null,
          p.value ?? null,
          p.unit,
          p.qualitative,
          p.sample_size ?? null,
          p.uncertainty,
          p.evidence,
          p.conditions_key,
          p.supersedes_id ?? null,
          principal.name,
        ],
      );
      result = { id: rows[0].id };
      description =
        "Observation recorded" +
        (p.value !== undefined ? `: ${p.value} ${p.unit}` : "");
    } else if (action === "record_analysis") {
      await entity(sql, "experiments", p.experiment_id, campaignId);
      await checkEvidence(sql, p.evidence_ids, campaignId, p.experiment_id);
      if (p.supersedes_id) {
        const old = await entity(
          sql,
          "research_analyses",
          p.supersedes_id,
          campaignId,
        );
        if (old.experiment_id !== p.experiment_id)
          throw new ResearchError(
            "Correction must refer to the same experiment",
          );
      }
      const { rows } = await sql.query(
        `INSERT INTO research_analyses(experiment_id,interpretation,comparison,limitations,uncertainty,confounders,alternative_explanations,conclusive,evidence_ids,supersedes_id,agent)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          p.experiment_id,
          p.interpretation,
          p.comparison,
          p.limitations,
          p.uncertainty,
          p.confounders,
          p.alternative_explanations,
          p.conclusive,
          p.evidence_ids,
          p.supersedes_id ?? null,
          principal.name,
        ],
      );
      result = { id: rows[0].id };
      description =
        "Agent analysis recorded: " + p.interpretation.slice(0, 240);
    } else if (action === "record_scientific_decision") {
      await entity(sql, "research_hypotheses", p.hypothesis_id, campaignId);
      const experiment = await entity(
        sql,
        "experiments",
        p.experiment_id,
        campaignId,
      );
      if (experiment.hypothesis_id !== p.hypothesis_id)
        throw new ResearchError("Experiment does not test this hypothesis");
      if (experiment.status !== "completed")
        throw new ResearchError(
          "Complete the experiment before recording a scientific decision",
          409,
        );
      await checkEvidence(sql, p.evidence_ids, campaignId, p.experiment_id);
      const analysis = await sql.query(
        "SELECT id FROM research_analyses WHERE experiment_id=$1",
        [p.experiment_id],
      );
      if (!analysis.rows.length)
        throw new ResearchError(
          "Record an evidence-linked analysis before a scientific decision",
          409,
        );
      if (p.next_hypothesis_id)
        await entity(
          sql,
          "research_hypotheses",
          p.next_hypothesis_id,
          campaignId,
        );
      if (p.supersedes_id) {
        const old = await entity(
          sql,
          "research_decisions",
          p.supersedes_id,
          campaignId,
        );
        if (old.experiment_id !== p.experiment_id)
          throw new ResearchError(
            "Correction must refer to the same experiment",
          );
      }
      const { rows } = await sql.query(
        `INSERT INTO research_decisions(hypothesis_id,experiment_id,outcome,rationale,next_action,evidence_ids,next_hypothesis_id,supersedes_id,agent)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          p.hypothesis_id,
          p.experiment_id,
          p.outcome,
          p.rationale,
          p.next_action,
          p.evidence_ids,
          p.next_hypothesis_id ?? null,
          p.supersedes_id ?? null,
          principal.name,
        ],
      );
      await sql.query("UPDATE research_hypotheses SET status=$2 WHERE id=$1", [
        p.hypothesis_id,
        p.outcome,
      ]);
      result = { id: rows[0].id, interpretation: "agent_reported" };
      description =
        "Agent concluded " + p.outcome + ": " + p.rationale.slice(0, 200);
    } else if (
      action === "request_human_review" ||
      action === "propose_next_step"
    ) {
      if (p.experiment_id)
        await entity(sql, "experiments", p.experiment_id, campaignId);
      await checkEvidence(sql, p.evidence_ids, campaignId);
      if (action === "propose_next_step" && !p.requires_approval) {
        result = { id: campaignId, requires_approval: false };
        description = "Next step proposed: " + p.proposed_action;
      } else {
        const { rows } = await sql.query(
          `INSERT INTO research_reviews(campaign_id,experiment_id,proposed_action,rationale,evidence_ids,impact,costs,requested_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [
            campaignId,
            p.experiment_id ?? null,
            p.proposed_action,
            p.rationale,
            p.evidence_ids,
            p.impact,
            p.costs,
            principal.name,
          ],
        );
        result = { id: rows[0].id, review_id: rows[0].id, status: "pending" };
        description = "Human review requested: " + p.proposed_action;
      }
    } else if (action === "review_request") {
      const review = await entity(
        sql,
        "research_reviews",
        p.review_id,
        campaignId,
      );
      if (review.status !== "pending")
        throw new ResearchError("Review has already been decided", 409);
      await sql.query(
        "UPDATE research_reviews SET status=$2,reviewed_by=$3,feedback=$4,reviewed_at=now() WHERE id=$1",
        [p.review_id, p.decision, principal.userId, p.feedback],
      );
      result = { id: p.review_id, status: p.decision };
      description = "Researcher " + p.decision + " the proposed action";
    } else if (action === "record_artifact") {
      await entity(sql, "research_runs", p.run_id, campaignId);
      const url = new URL(p.url);
      if (url.username || url.password)
        throw new ResearchError(
          "Artifact references must not contain credentials",
        );
      const { rows } = await sql.query(
        `INSERT INTO research_artifacts(run_id,type,url,checksum,version,metadata) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          p.run_id,
          p.type,
          p.url,
          p.checksum,
          p.version,
          JSON.stringify(p.metadata),
        ],
      );
      result = { id: rows[0].id };
      description = "Reproducibility artifact registered: " + p.type;
    }
    entityId = (result.id as string) || entityId;
    // Never include access tokens in the audit event or response cache.
    const { access_token: secret, ...auditInput } = p;
    void secret;
    const event = await sql.query(
      `INSERT INTO research_events(campaign_id,entity_id,event_type,actor,actor_user_id,description,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        campaignId,
        entityId,
        action,
        principal.name,
        principal.userId,
        description,
        JSON.stringify({ input: auditInput, result }),
      ],
    );
    result = {
      ...result,
      campaign_id: campaignId,
      event_id: Number(event.rows[0].id),
    };
    await sql.query(
      "INSERT INTO research_mutations(user_id,idempotency_key,fingerprint,response) VALUES($1,$2,$3,$4)",
      [principal.userId, key, fingerprint, JSON.stringify(result)],
    );
    await sql.query("COMMIT");
    return result;
  } catch (error) {
    await sql.query("ROLLBACK");
    throw error;
  } finally {
    sql.release();
  }
}

export async function listResearchCampaigns(principal: Principal) {
  const { rows } = await getAuthPool().query(
    `SELECT c.id,c.title,c.question,c.summary,c.status,c.visibility,c.created_at,m.role,
    (SELECT count(*)::int FROM experiments e WHERE e.campaign_id=c.id) AS experiments
    FROM campaigns c JOIN research_campaign_members m ON m.campaign_id=c.id WHERE m.user_id=$1 AND ($2::uuid IS NULL OR c.id=$2)
    ORDER BY c.created_at DESC,c.id LIMIT 100`,
    [
      principal.userId,
      principal.kind === "agent" ? (principal.campaignId ?? null) : null,
    ],
  );
  return {
    campaigns: rows,
    user: { id: principal.userId, name: principal.name },
  };
}
export async function researchSnapshot(
  campaignId: string,
  principal: Principal,
) {
  const sql = await getAuthPool().connect();
  try {
    await sql.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await assertCampaignAccess(sql, campaignId, principal);
    const campaign = (
      await sql.query(
        "SELECT id,title,question,summary,objective,status,constraints,stop_conditions,visibility,created_at FROM campaigns WHERE id=$1",
        [campaignId],
      )
    ).rows[0];
    const metrics = (
      await sql.query(
        "SELECT * FROM research_metrics WHERE campaign_id=$1 ORDER BY created_at,id",
        [campaignId],
      )
    ).rows;
    const hypotheses = (
      await sql.query(
        "SELECT * FROM research_hypotheses WHERE campaign_id=$1 ORDER BY created_at,id LIMIT 300",
        [campaignId],
      )
    ).rows;
    const experiments = (
      await sql.query(
        `SELECT id,campaign_id,hypothesis_id,title,hypothesis,method,inputs,conditions,success_criteria,variables,controls,expected_outcome,status,outcome,agent,created_at,started_at,completed_at FROM experiments WHERE campaign_id=$1 ORDER BY created_at,id LIMIT 500`,
        [campaignId],
      )
    ).rows;
    const runs = (
      await sql.query(
        `SELECT r.*,r.status='running' AND r.last_heartbeat_at<now()-interval '5 minutes' AS stale FROM research_runs r JOIN experiments e ON e.id=r.experiment_id WHERE e.campaign_id=$1 ORDER BY r.started_at,r.id LIMIT 1500`,
        [campaignId],
      )
    ).rows;
    const observations = (
      await sql.query(
        `SELECT o.* FROM research_observations o JOIN research_runs r ON r.id=o.run_id JOIN experiments e ON e.id=r.experiment_id WHERE e.campaign_id=$1 ORDER BY o.created_at,o.id LIMIT 3000`,
        [campaignId],
      )
    ).rows;
    const analyses = (
      await sql.query(
        `SELECT a.* FROM research_analyses a JOIN experiments e ON e.id=a.experiment_id WHERE e.campaign_id=$1 ORDER BY a.created_at,a.id LIMIT 1000`,
        [campaignId],
      )
    ).rows;
    const decisions = (
      await sql.query(
        `SELECT d.* FROM research_decisions d JOIN experiments e ON e.id=d.experiment_id WHERE e.campaign_id=$1 ORDER BY d.created_at,d.id LIMIT 1000`,
        [campaignId],
      )
    ).rows;
    const reviews = (
      await sql.query(
        'SELECT r.*,u.name AS reviewer_name FROM research_reviews r LEFT JOIN "user" u ON u.id=r.reviewed_by WHERE r.campaign_id=$1 ORDER BY r.created_at DESC,r.id LIMIT 500',
        [campaignId],
      )
    ).rows;
    const events = (
      await sql.query(
        "SELECT id::float8 AS id,campaign_id,entity_id,event_type,actor,description,payload,created_at FROM research_events WHERE campaign_id=$1 ORDER BY id DESC LIMIT 200",
        [campaignId],
      )
    ).rows.reverse();
    const artifacts = (
      await sql.query(
        `SELECT a.* FROM research_artifacts a JOIN research_runs r ON r.id=a.run_id JOIN experiments e ON e.id=r.experiment_id WHERE e.campaign_id=$1 ORDER BY a.created_at,a.id LIMIT 1000`,
        [campaignId],
      )
    ).rows;
    const reproduction = (
      await sql.query(
        `SELECT e.id,coalesce(s.reproduced_count,0) AS reproduced_count,coalesce(s.not_reproduced_count,0) AS not_reproduced_count FROM experiments e LEFT JOIN public_reproduction_summary s ON s.experiment_id=e.id WHERE e.campaign_id=$1`,
        [campaignId],
      )
    ).rows;
    const primary = metrics[0];
    // Headline values query the complete campaign; bounded detail collections
    // must never make the scientific summary silently ignore later records.
    const totals = (
      await sql.query(
        `SELECT
      (SELECT count(*)::int FROM experiments WHERE campaign_id=$1 AND status='running') AS active_experiments,
      (SELECT count(*)::int FROM experiments WHERE campaign_id=$1 AND status='completed') AS completed_experiments,
      (SELECT count(*)::int FROM research_hypotheses WHERE campaign_id=$1 AND status<>'untested') AS hypotheses_investigated,
      (SELECT count(*)::int FROM research_reviews WHERE campaign_id=$1 AND status='pending') AS pending_reviews,
      (SELECT d.outcome FROM research_decisions d JOIN experiments e ON e.id=d.experiment_id WHERE e.campaign_id=$1 ORDER BY d.created_at DESC,d.id DESC LIMIT 1) AS latest_outcome`,
        [campaignId],
      )
    ).rows[0];
    let best: Record<string, any> | null = null,
      verified: Record<string, any> | null = null;
    if (primary) {
      const candidates = (
        await sql.query(
          `WITH candidates AS (
        SELECT o.value,r.experiment_id,o.run_id,o.conditions_key,o.created_at,o.id,
          coalesce(s.reproduced_count,0)>0 AND coalesce(s.not_reproduced_count,0)=0 AS verified,
          CASE WHEN $5='minimize' THEN o.value WHEN $5='range' THEN greatest($6-o.value,o.value-$7,0) ELSE -o.value END AS sort_value
        FROM research_observations o JOIN research_runs r ON r.id=o.run_id JOIN experiments e ON e.id=r.experiment_id
        LEFT JOIN public_reproduction_summary s ON s.experiment_id=e.id
        WHERE e.campaign_id=$1 AND r.status='completed' AND o.metric_id=$2 AND o.unit=$3 AND o.conditions_key=$4 AND o.value IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM research_observations corrected WHERE corrected.supersedes_id=o.id)
      ) SELECT (SELECT row_to_json(c) FROM candidates c ORDER BY sort_value,created_at,id LIMIT 1) AS best,
        (SELECT row_to_json(c) FROM candidates c WHERE verified ORDER BY sort_value,created_at,id LIMIT 1) AS reproduced`,
          [
            campaignId,
            primary.id,
            primary.unit,
            primary.evaluation_protocol,
            primary.direction,
            primary.target,
            primary.target_max ?? primary.target,
          ],
        )
      ).rows[0];
      best = candidates.best;
      verified = candidates.reproduced;
    }
    await sql.query("COMMIT");
    return {
      campaign,
      metrics,
      hypotheses,
      experiments,
      runs,
      observations,
      analyses,
      decisions,
      reviews,
      events,
      artifacts,
      reproduction,
      summary: {
        ...totals,
        best_result: best,
        best_verified_result: verified,
        ...(primary
          ? metricProgress(primary, best?.value ?? null)
          : { progress_percent: null, target_gap: null }),
        incomparable_observations: observations.filter(
          (o) =>
            o.metric_id === primary?.id && !compatibleObservation(primary, o),
        ).length,
      },
      limits: {
        hypotheses: 300,
        experiments: 500,
        runs: 1500,
        observations: 3000,
        events: 200,
      },
      trust:
        "Agent interpretations and reproduction reports are self-reported. Metric improvement does not prove a hypothesis.",
    };
  } catch (error) {
    await sql.query("ROLLBACK");
    throw error;
  } finally {
    sql.release();
  }
}
export async function researchEvents(
  campaignId: string,
  principal: Principal,
  after: number,
) {
  await assertCampaignAccess(getAuthPool(), campaignId, principal);
  return (
    await getAuthPool().query(
      `SELECT id::float8 AS id,event_type,entity_id,actor,description,created_at FROM research_events WHERE campaign_id=$1 AND id>$2 ORDER BY id LIMIT 100`,
      [campaignId, after],
    )
  ).rows;
}
