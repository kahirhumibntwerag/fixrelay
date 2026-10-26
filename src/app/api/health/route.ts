import { db } from "@/lib/reports";
export async function GET() {
  try {
    await db()`SELECT 1 FROM reports LIMIT 1`;
    await db()`SELECT 1 FROM experiments LIMIT 1`;
    return Response.json({ status: "ok", database: "neon", mcp: "/mcp" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
