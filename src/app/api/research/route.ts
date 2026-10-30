import { z } from "zod";
import { assertSameOrigin, requirePrincipal } from "@/lib/auth-access";
import {
  errorResponse,
  listResearchCampaigns,
  mutateResearch,
  researchSnapshot,
} from "@/lib/research";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const command = z.object({
  action: z.string().max(80),
  input: z.unknown(),
  idempotency_key: z.string().min(8).max(160),
});
export async function GET(request: Request) {
  try {
    const principal = await requirePrincipal(request);
    const id = new URL(request.url).searchParams.get("campaign_id");
    return Response.json(
      id
        ? await researchSnapshot(id, principal)
        : await listResearchCampaigns(principal),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const principal = await requirePrincipal(request);
    if (principal.kind === "human") assertSameOrigin(request);
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json({ error: "Body required" }, { status: 400 });
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100000) {
        await reader.cancel();
        return Response.json({ error: "Request too large" }, { status: 413 });
      }
      chunks.push(value);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const p = command.parse(body);
    return Response.json(
      await mutateResearch(p.action, p.input, principal, p.idempotency_key),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
