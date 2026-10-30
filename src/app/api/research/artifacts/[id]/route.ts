import { z } from "zod";
import { requirePrincipal } from "@/lib/auth-access";
import { getAuthPool } from "@/lib/auth";
import {
  assertCampaignAccess,
  errorResponse,
  ResearchError,
} from "@/lib/research";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const principal = await requirePrincipal(request),
      { id } = await params;
    z.string().uuid().parse(id);
    const { rows } = await getAuthPool().query(
      "SELECT a.*,e.campaign_id FROM research_artifacts a JOIN research_runs r ON r.id=a.run_id JOIN experiments e ON e.id=r.experiment_id WHERE a.id=$1",
      [id],
    );
    if (!rows[0]) throw new ResearchError("Artifact not found", 404);
    await assertCampaignAccess(getAuthPool(), rows[0].campaign_id, principal);
    // Only metadata is served. Remote storage remains responsible for its own access controls.
    return Response.json(rows[0], {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
