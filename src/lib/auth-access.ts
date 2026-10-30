import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getAuth, getAuthPool } from "./auth";

export type Principal = {
  kind: "human" | "agent";
  userId: string;
  name: string;
  keyId?: string;
  campaignId?: string | null;
};

function denied(message = "Sign in or supply an agent bearer credential.", status = 401): never {
  throw Object.assign(new Error(message), { status });
}

export function credentialHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requirePrincipal(request: Request): Promise<Principal> {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    if (!authorization.startsWith("Bearer ")) denied("Invalid agent credential.");
    const token = authorization.slice(7);
    if (!/^rgn_[A-Za-z0-9_-]{43}$/.test(token)) denied("Invalid agent credential.");
    const { rows } = await getAuthPool().query(
      `SELECT k.id,k.user_id,k.campaign_id,k.name FROM research_agent_keys k JOIN "user" u ON u.id=k.user_id WHERE k.token_hash=$1 AND k.revoked_at IS NULL`,
      [credentialHash(token)],
    );
    if (!rows[0]) denied("Invalid or revoked agent credential.");
    return { kind: "agent", userId: rows[0].user_id, name: rows[0].name, keyId: rows[0].id, campaignId: rows[0].campaign_id };
  }
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) denied();
  return { kind: "human", userId: session.user.id, name: session.user.name };
}

export async function requireHuman(request: Request): Promise<Principal> {
  const principal = await requirePrincipal(request);
  if (principal.kind !== "human") denied("Only a signed-in researcher can perform this action.", 403);
  return principal;
}

export async function currentHuman(): Promise<Principal | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session ? { kind: "human", userId: session.user.id, name: session.user.name } : null;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.BETTER_AUTH_URL || request.url).origin;
  if (!origin || origin !== expected) denied("Request origin is not allowed.", 403);
}

export async function readAuthJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) denied("Request body is required.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) { await reader.cancel(); denied("Request body is too large.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { denied("Invalid JSON.", 400); }
}

export function authErrorResponse(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
  return Response.json({ error: status < 500 && error instanceof Error ? error.message : "Unable to complete this request. Please try again." }, { status, headers: { "Cache-Control": "no-store" } });
}
