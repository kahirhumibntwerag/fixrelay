import { chartErrorResponse, researchChartImage } from "@/lib/research-charts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return await researchChartImage((await params).id, request);
  } catch (error) {
    return chartErrorResponse(error);
  }
}
