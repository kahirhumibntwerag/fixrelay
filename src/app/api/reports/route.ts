import { searchReports } from "@/lib/reports";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  try {
    return Response.json({
      reports: await searchReports(
        (p.get("q") || "").slice(0, 500),
        (p.get("tag") || "").slice(0, 40),
        20,
        Math.min(10000, Math.max(0, Number(p.get("offset")) || 0)),
      ),
    });
  } catch {
    return Response.json(
      { error: "Reports are temporarily unavailable" },
      { status: 503 },
    );
  }
}
