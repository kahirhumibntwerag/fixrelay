import { timingSafeEqual } from "node:crypto";
export function canWrite(request: Request) {
  const token = process.env.MCP_WRITE_TOKEN;
  if (!token) return true;
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
