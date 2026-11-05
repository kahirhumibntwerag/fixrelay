import { requirePrincipal } from "@/lib/auth-access";
import { errorResponse } from "@/lib/research";
import { getSeriesChart, listSeriesCharts } from "@/lib/research-series";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const principal = params.get("public") === "1" ? undefined : await requirePrincipal(request);
    const input = {campaign_id:params.get("campaign_id"),offset:Number(params.get("offset") || 0),limit:Number(params.get("limit") || (params.has("chart_id") ? 1000 : 20))};
    const result = params.has("chart_id") ? await getSeriesChart({...input,chart_id:params.get("chart_id")},principal) : await listSeriesCharts(input,principal);
    return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
  } catch (error) { return errorResponse(error); }
}
