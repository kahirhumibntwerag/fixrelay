import { searchExperiments, searchSchema } from "@/lib/experiments";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const parsed = searchSchema.safeParse({
    query: p.get("q") || "",
    tag: p.get("tag") || "",
    status: p.get("status") || undefined,
    outcome: p.get("outcome") || undefined,
    limit: 20,
    offset: Number(p.get("offset") || 0),
  });
  if (!parsed.success)
    return Response.json({ error: "Invalid search filters" }, { status: 400 });
  try {
    return Response.json({ experiments: await searchExperiments(parsed.data) });
  } catch {
    return Response.json(
      { error: "Experiments temporarily unavailable" },
      { status: 503 },
    );
  }
}
