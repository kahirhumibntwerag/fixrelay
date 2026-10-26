import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./reports";
import {
  accessTokenSchema,
  ExperimentError,
  hash,
  ownerHash,
  quota,
  getExperiment,
  type Experiment,
} from "./experiments";
export const campaignSchema = z.object({
  title: z.string().trim().min(8).max(180),
  question: z.string().trim().min(20).max(1500),
  summary: z.string().trim().min(20).max(2000),
  visibility: z.enum(["private", "public"]).default("private"),
  access_token: accessTokenSchema.optional(),
});
export const linkSchema = z.object({
  campaign_id: z.string().uuid(),
  parent_id: z.string().uuid(),
  child_id: z.string().uuid(),
  relation: z
    .enum(["follow_up", "refinement", "replication", "dependency"])
    .default("follow_up"),
  reason: z.string().trim().min(10).max(500),
  access_token: accessTokenSchema,
});
export const clip = (s: string | null | undefined, n: number) =>
  s && s.length > n ? s.slice(0, n) + "…" : s || "";
export async function publishCampaign(
  id: string,
  token: string,
  identity: string,
) {
  const sql = db();
  const rows =
    await sql`SELECT id FROM campaigns WHERE id=${id} AND owner_hash=${ownerHash(token)}`;
  if (!rows[0]) throw new ExperimentError("Campaign inaccessible.");
  await quota(identity);
  await sql`UPDATE campaigns SET visibility='public' WHERE id=${id} AND owner_hash=${ownerHash(token)}`;
  return {
    id,
    visibility: "public",
    note: "Experiments and reports keep their own visibility.",
  };
}
export function experimentSummary(e: Experiment) {
  return {
    id: e.id,
    title: e.title,
    question: clip(e.question, 160),
    status: e.status,
    outcome: e.outcome,
    visibility: e.visibility,
    campaign: e.campaign_id
      ? { id: e.campaign_id, title: e.campaign_title }
      : null,
    reproduction_status: e.reproduction_status,
    reproduced: e.reproduced_count,
    not_reproduced: e.not_reproduced_count,
    unable_to_assess:
      e.unable_to_assess_count +
      e.inconclusive_count +
      e.technical_failure_count,
  };
}
export function bounded<T>(
  items: T[],
  offset: number,
  limit: number,
  maxChars = 6000,
) {
  const selected: T[] = [];
  let size = 0;
  for (const item of items) {
    const length = JSON.stringify(item).length;
    if (size + length > maxChars) break;
    selected.push(item);
    size += length;
  }
  return {
    items: selected,
    next_offset:
      selected.length < items.length || items.length === limit
        ? offset + selected.length
        : null,
    truncated: selected.length < items.length,
  };
}
export async function createCampaign(
  input: z.input<typeof campaignSchema>,
  identity: string,
) {
  const p = campaignSchema.parse(input),
    token = p.access_token || randomBytes(32).toString("base64url"),
    owner = ownerHash(token),
    fingerprint = hash(
      JSON.stringify([p.title, p.question, p.summary, p.visibility]),
    );
  const sql = db();
  const old =
    await sql`SELECT id,visibility FROM campaigns WHERE owner_hash=${owner} AND fingerprint=${fingerprint}`;
  if (old[0])
    return {
      id: old[0].id,
      access_token: token,
      duplicate: true,
      visibility: old[0].visibility,
    };
  await quota(identity);
  const rows =
    await sql`INSERT INTO campaigns(title,question,summary,visibility,owner_hash,fingerprint) VALUES(${p.title},${p.question},${p.summary},${p.visibility},${owner},${fingerprint}) ON CONFLICT(owner_hash,fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint RETURNING id`;
  return {
    id: rows[0].id,
    access_token: token,
    duplicate: false,
    visibility: p.visibility,
  };
}
export async function searchCampaigns(
  query = "",
  token?: string,
  limit = 5,
  offset = 0,
  owned = false,
) {
  const rows =
    await db()`SELECT c.id,c.title,c.question,c.summary,c.visibility,c.created_at,(SELECT count(*)::int FROM experiments e WHERE e.campaign_id=c.id AND(e.visibility='public' OR e.owner_hash=${ownerHash(token)})) AS experiments FROM campaigns c WHERE((c.visibility='public' AND NOT ${owned}) OR c.owner_hash=${ownerHash(token)}) AND(${query}='' OR c.title ILIKE ${"%" + query + "%"} OR c.question ILIKE ${"%" + query + "%"}) ORDER BY c.created_at DESC,c.id LIMIT ${limit} OFFSET ${offset}`;
  return rows.map((c) => ({
    id: c.id as string,
    title: c.title as string,
    visibility: c.visibility as string,
    created_at: c.created_at as string,
    experiments: Number(c.experiments),
    question: clip(c.question as string, 200),
    summary: clip(c.summary as string, 240),
  }));
}
export async function getCampaign(
  id: string,
  token?: string,
  limit = 10,
  offset = 0,
) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const sql = db();
  const rows =
    await sql`SELECT id,title,question,summary,visibility,created_at FROM campaigns WHERE id=${id} AND(visibility='public' OR owner_hash=${ownerHash(token)})`;
  if (!rows[0]) return null;
  const experiments =
    await sql`SELECT e.id,e.title,e.status,e.outcome,e.created_at,s.reproduced_count,s.not_reproduced_count,s.unable_to_assess_count,s.inconclusive_count,s.technical_failure_count FROM experiments e LEFT JOIN public_reproduction_summary s ON s.experiment_id=e.id WHERE e.campaign_id=${id} AND(e.visibility='public' OR e.owner_hash=${ownerHash(token)}) ORDER BY e.created_at,e.id LIMIT ${limit} OFFSET ${offset}`;
  const nodes = await Promise.all(
    experiments.map(async (e) => {
      const parents =
        await sql`SELECT l.parent_id,l.relation,l.reason,p.title FROM experiment_links l JOIN experiments p ON p.id=l.parent_id WHERE l.child_id=${e.id} AND(p.visibility='public' OR p.owner_hash=${ownerHash(token)}) ORDER BY l.created_at,l.parent_id LIMIT 6`;
      return {
        ...e,
        parents: parents.slice(0, 5),
        more_parents: parents.length > 5,
      };
    }),
  );
  return {
    campaign: rows[0],
    experiments: nodes,
    offset,
    next_offset:
      experiments.length === limit ? offset + experiments.length : null,
  };
}
export async function linkExperiments(
  input: z.input<typeof linkSchema>,
  identity: string,
) {
  const p = linkSchema.parse(input);
  await quota(identity);
  try {
    await db()`SELECT link_campaign_experiments(${p.campaign_id}::uuid,${p.parent_id}::uuid,${p.child_id}::uuid,${ownerHash(p.access_token)},${p.relation},${p.reason})`;
    return {
      campaign_id: p.campaign_id,
      parent_id: p.parent_id,
      child_id: p.child_id,
      relation: p.relation,
    };
  } catch (e) {
    if (
      e instanceof Error &&
      /cycle|Both experiments|inaccessible|different relation/.test(e.message)
    )
      throw new ExperimentError(e.message);
    throw e;
  }
}
export async function getTrail(
  id: string,
  token: string | undefined,
  direction: "parents" | "children",
  limit = 3,
  offset = 0,
) {
  const source = await getExperiment(id, token);
  if (!source) return null;
  if (!source.campaign_id)
    return {
      experiment: experimentSummary(source),
      neighbors: [],
      next_offset: null,
    };
  const sql = db();
  const rows =
    direction === "parents"
      ? await sql`SELECT p.id,p.title,p.status,p.outcome,l.relation,l.reason FROM experiment_links l JOIN experiments p ON p.id=l.parent_id WHERE l.child_id=${id} AND l.campaign_id=${source.campaign_id} AND(p.visibility='public' OR p.owner_hash=${ownerHash(token)}) ORDER BY l.created_at,p.id LIMIT ${limit} OFFSET ${offset}`
      : await sql`SELECT c.id,c.title,c.status,c.outcome,l.relation,l.reason FROM experiment_links l JOIN experiments c ON c.id=l.child_id WHERE l.parent_id=${id} AND l.campaign_id=${source.campaign_id} AND(c.visibility='public' OR c.owner_hash=${ownerHash(token)}) ORDER BY l.created_at,c.id LIMIT ${limit} OFFSET ${offset}`;
  return {
    experiment: experimentSummary(source),
    direction,
    depth: 1,
    neighbors: rows,
    next_offset: rows.length === limit ? offset + rows.length : null,
  };
}
