import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getAuthPool } from "@/lib/auth";
import { assertSameOrigin, authErrorResponse, credentialHash, readAuthJson, requireHuman } from "@/lib/auth-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireHuman(request);
    const pool = getAuthPool();
    const [keys, campaigns] = await Promise.all([
      pool.query(`SELECT k.id,k.name,k.campaign_id,c.title AS campaign_title,k.created_at,k.revoked_at FROM research_agent_keys k LEFT JOIN campaigns c ON c.id=k.campaign_id WHERE k.user_id=$1 ORDER BY k.created_at DESC LIMIT 100`, [user.userId]),
      pool.query(`SELECT c.id,c.title FROM campaigns c JOIN research_campaign_members m ON m.campaign_id=c.id WHERE m.user_id=$1 AND m.role IN ('owner','researcher') ORDER BY c.created_at DESC LIMIT 100`, [user.userId]),
    ]);
    return Response.json({ keys: keys.rows, campaigns: campaigns.rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireHuman(request);
    const input = z.object({ name: z.string().trim().min(2).max(80), campaign_id: z.string().uuid().nullable().default(null) }).parse(await readAuthJson(request));
    const client = await getAuthPool().connect();
    try {
      await client.query("BEGIN");
      if (input.campaign_id) {
        const membership = await client.query(`SELECT role FROM research_campaign_members WHERE campaign_id=$1 AND user_id=$2 AND role IN ('owner','researcher') FOR SHARE`, [input.campaign_id, user.userId]);
        if (!membership.rows[0]) throw Object.assign(new Error("You cannot create a credential for this campaign."), { status: 403 });
      }
      const limit = await client.query(`INSERT INTO write_quotas(key,window_start,count) VALUES($1,date_trunc('hour',now()),1) ON CONFLICT(key,window_start) DO UPDATE SET count=write_quotas.count+1 WHERE write_quotas.count<20 RETURNING count`, ["agent-keys:" + user.userId]);
      if (!limit.rowCount) throw Object.assign(new Error("Credential limit reached. Try again later."), { status: 429 });
      const token = "rgn_" + randomBytes(32).toString("base64url");
      const result = await client.query(`INSERT INTO research_agent_keys(user_id,campaign_id,name,token_hash) VALUES($1,$2,$3,$4) RETURNING id,name,campaign_id,created_at`, [user.userId, input.campaign_id, input.name, credentialHash(token)]);
      await client.query(`INSERT INTO research_auth_events(user_id,event_type,key_id) VALUES($1,'agent_key_created',$2)`, [user.userId, result.rows[0].id]);
      await client.query("COMMIT");
      return Response.json({ key: result.rows[0], token }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Enter a name and a valid campaign scope." }, { status: 400 });
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireHuman(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(await readAuthJson(request));
    const client = await getAuthPool().connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(`UPDATE research_agent_keys SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id`, [id, user.userId]);
      if (!result.rows[0]) throw Object.assign(new Error("Active credential not found."), { status: 404 });
      await client.query(`INSERT INTO research_auth_events(user_id,event_type,key_id) VALUES($1,'agent_key_revoked',$2)`, [user.userId, id]);
      await client.query("COMMIT");
      return Response.json({ revoked: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid credential ID." }, { status: 400 });
    return authErrorResponse(error);
  }
}
