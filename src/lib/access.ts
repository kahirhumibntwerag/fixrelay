import { timingSafeEqual } from "node:crypto";
import { assertSameOrigin, requirePrincipal } from './auth-access';
export async function canWrite(request: Request) {
  try {
    const principal=await requirePrincipal(request);
    if(principal.kind==='human')assertSameOrigin(request);
    // Scoped observatory credentials cannot be used to bypass campaign checks in the legacy API.
    return principal.kind==='human' || !principal.campaignId;
  } catch { /* Legacy operator credential remains valid when explicitly configured. */ }
  const token = process.env.MCP_WRITE_TOKEN;
  if (!token) return false;
  const provided = request.headers.get("authorization") || "";
  const expected = `Bearer ${token}`;
  const a = Buffer.from(provided),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function clientIdentity(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anonymous"
  );
}
