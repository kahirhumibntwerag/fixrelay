import { assertSameOrigin, requirePrincipal } from "@/lib/auth-access";
import {
  chartErrorResponse,
  ChartError,
  listPublicResearchCharts,
  listResearchCharts,
  MAX_CHART_BYTES,
  uploadResearchChart,
} from "@/lib/research-charts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url),
      campaignId = url.searchParams.get("campaign_id") || "";
    const offset = Number(url.searchParams.get("offset") || 0),
      limit = Number(url.searchParams.get("limit") || 30);
    const data =
      url.searchParams.get("public") === "true"
        ? await listPublicResearchCharts(campaignId, offset, limit)
        : await listResearchCharts(
            campaignId,
            await requirePrincipal(request),
            offset,
            limit,
          );
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return chartErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requirePrincipal(request);
    if (principal.kind === "human") assertSameOrigin(request);
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.startsWith("multipart/form-data;"))
      throw new ChartError("Upload the chart as multipart form data");
    const reader = request.body?.getReader();
    if (!reader) throw new ChartError("A chart file is required");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CHART_BYTES + 65536) {
        await reader.cancel();
        throw new ChartError(
          "Chart upload is too large; images are limited to 2 MiB",
          413,
        );
      }
      chunks.push(value);
    }
    let form: FormData;
    try {
      form = await new Response(new Uint8Array(Buffer.concat(chunks)), {
        headers: { "Content-Type": contentType },
      }).formData();
    } catch {
      throw new ChartError("Invalid multipart form data");
    }
    const file = form.get("file");
    if (!(file instanceof File))
      throw new ChartError("A chart file is required");
    if (file.size > MAX_CHART_BYTES)
      throw new ChartError("Charts are limited to 2 MiB", 413);
    const text = (name: string) =>
      typeof form.get(name) === "string" ? String(form.get(name)) : "";
    const input = {
      campaign_id: text("campaign_id"),
      title: text("title"),
      caption: text("caption"),
      mime_type: file.type,
      ...(text("experiment_id")
        ? { experiment_id: text("experiment_id") }
        : {}),
      ...(text("metric_id") ? { metric_id: text("metric_id") } : {}),
    };
    const result = await uploadResearchChart(
      input,
      Buffer.from(await file.arrayBuffer()),
      principal,
      text("idempotency_key"),
    );
    return Response.json(result, {
      status: result.replayed ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return chartErrorResponse(error);
  }
}
