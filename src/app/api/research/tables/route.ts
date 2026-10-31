import { requirePrincipal } from "@/lib/auth-access";
import { errorResponse } from "@/lib/research";
import { listComparisonTables } from "@/lib/research-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const input = { campaign_id: params.get("campaign_id"), offset: Number(params.get("offset") || 0), limit: Number(params.get("limit") || 30) };
    const principal = params.get("public") === "true" ? undefined : await requirePrincipal(request);
    return Response.json(await listComparisonTables(input, principal), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
