import { randomBytes } from "node:crypto";
import { db } from "./reports";
import {
  reproductionSchema,
  getExperiment,
  ownerHash,
  hash,
  quota,
  ExperimentError,
} from "./experiments";
import { z } from "zod";
export async function submit(
  input: z.input<typeof reproductionSchema>,
  identity: string,
) {
  const p = reproductionSchema.parse(input),
    token = p.access_token || randomBytes(32).toString("base64url"),
    owner = ownerHash(token),
    sql = db();
  let agent = p.agent,
    conditions = p.conditions,
    visibility = p.visibility;
  if (p.reproduction_id) {
    const rows =
      await sql`SELECT id,replication_of,status,agent,conditions,visibility FROM experiments WHERE id=${p.reproduction_id} AND owner_hash=${owner}`;
    const r = rows[0];
    if (!r || r.replication_of !== p.experiment_id)
      throw new ExperimentError(
        "A linked reproduction must reference your own replication experiment.",
      );
    if (r.status !== "completed")
      throw new ExperimentError("Record the linked replication outcome first.");
    agent = r.agent as string;
    conditions = r.conditions as string;
    visibility = r.visibility as "public" | "private";
  } else if (!agent || !conditions)
    throw new ExperimentError(
      "Direct reports require agent and conditions. No separate experiment is necessary.",
    );
  const source = await getExperiment(p.experiment_id, token);
  if (!source || source.status !== "completed")
    throw new ExperimentError(
      "Original experiment inaccessible or has no completed result.",
    );
  if (visibility === "public" && source.visibility !== "public")
    throw new ExperimentError(
      "A private experiment cannot receive a public report.",
    );
  const digest = hash(
    JSON.stringify(
      p.reproduction_id
        ? [
            p.experiment_id,
            p.reproduction_id,
            p.result,
            p.observations,
            p.evidence,
            p.differences,
          ]
        : [
            p.experiment_id,
            "",
            p.result,
            p.observations,
            p.evidence,
            p.differences,
            agent,
            conditions,
          ],
    ),
  );
  const old =
    await sql`SELECT id,report_hash FROM reproduction_reports WHERE (reproduction_id=${p.reproduction_id || null}::uuid) OR (owner_hash=${owner} AND report_hash=${digest}) LIMIT 1`;
  if (old[0]) {
    if (old[0].report_hash !== digest)
      throw new ExperimentError(
        "This linked attempt already has a different immutable report.",
      );
    return { id: old[0].id, duplicate: true, access_token: token };
  }
  await quota(identity);
  const rows =
    await sql`INSERT INTO reproduction_reports(experiment_id,reproduction_id,result,observations,evidence,differences,report_hash,owner_hash,agent,conditions,visibility) VALUES(${p.experiment_id},${p.reproduction_id || null},${p.result},${p.observations},${p.evidence},${p.differences},${digest},${owner},${agent!},${conditions!},${visibility}) ON CONFLICT DO NOTHING RETURNING id`;
  if (!rows[0]) {
    const current =
      await sql`SELECT id,report_hash FROM reproduction_reports WHERE (reproduction_id=${p.reproduction_id || null}::uuid) OR(owner_hash=${owner} AND report_hash=${digest}) LIMIT 1`;
    if (current[0]?.report_hash !== digest)
      throw new ExperimentError("Another report was recorded concurrently.");
    return { id: current[0].id, duplicate: true, access_token: token };
  }
  return {
    id: rows[0].id,
    experiment_id: p.experiment_id,
    result: p.result,
    visibility,
    access_token: token,
    duplicate: false,
  };
}
export async function listReports(
  experimentId: string,
  token?: string,
  limit = 5,
  offset = 0,
) {
  if (!(await getExperiment(experimentId, token))) return null;
  return await db()`SELECT r.id,r.result,r.created_at,r.reproduction_id,coalesce(e.agent,r.agent) AS agent,left(r.observations,200) AS summary FROM reproduction_reports r LEFT JOIN experiments e ON e.id=r.reproduction_id WHERE r.experiment_id=${experimentId} AND(coalesce(e.visibility,r.visibility)='public' OR coalesce(e.owner_hash,r.owner_hash)=${ownerHash(token)}) ORDER BY r.created_at DESC,r.id LIMIT ${limit} OFFSET ${offset}`;
}
export async function getReport(id: string, token?: string) {
  const rows =
    await db()`SELECT r.id,r.experiment_id,r.reproduction_id,r.result,r.observations,r.evidence,r.differences,r.created_at,coalesce(e.agent,r.agent) AS agent,coalesce(e.conditions,r.conditions) AS conditions,coalesce(e.visibility,r.visibility) AS visibility FROM reproduction_reports r LEFT JOIN experiments e ON e.id=r.reproduction_id WHERE r.id=${id} AND(coalesce(e.visibility,r.visibility)='public' OR coalesce(e.owner_hash,r.owner_hash)=${ownerHash(token)})`;
  if (
    !rows[0] ||
    !(await getExperiment(rows[0].experiment_id as string, token))
  )
    return null;
  return rows[0];
}
export async function publishReport(
  id: string,
  token: string,
  identity: string,
) {
  const sql = db();
  const rows =
    await sql`SELECT r.id,r.experiment_id,r.reproduction_id FROM reproduction_reports r LEFT JOIN experiments e ON e.id=r.reproduction_id WHERE r.id=${id} AND coalesce(e.owner_hash,r.owner_hash)=${ownerHash(token)}`;
  if (!rows[0]) throw new ExperimentError("Report inaccessible.");
  if (rows[0].reproduction_id)
    throw new ExperimentError(
      "Publish the linked reproduction experiment to share this legacy report.",
    );
  if (!(await getExperiment(rows[0].experiment_id as string)))
    throw new ExperimentError("Publish the original experiment first.");
  await quota(identity);
  await sql`UPDATE reproduction_reports SET visibility='public' WHERE id=${id} AND owner_hash=${ownerHash(token)}`;
  return { id, visibility: "public" };
}
