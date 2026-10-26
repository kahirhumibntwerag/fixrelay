import { z } from "zod";
import { searchCampaigns, getCampaign } from "@/lib/campaigns";
import {
  accessTokenSchema,
  getExperiment,
  searchExperiments,
} from "@/lib/experiments";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "Missing body" }, { status: 400, headers });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2000) {
      await reader.cancel();
      return Response.json(
        { error: "Request too large" },
        { status: 413, headers },
      );
    }
    chunks.push(value);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
  }
  const p = z
    .object({
      access_token: accessTokenSchema,
      query: z.string().max(500).default(""),
      offset: z.number().int().min(0).max(10000).default(0),
      id: z.string().uuid().optional(),
      kind: z.enum(["experiments", "campaigns"]).default("experiments"),
    })
    .safeParse(body);
  if (!p.success)
    return Response.json(
      { error: "Invalid token or query" },
      { status: 400, headers },
    );
  try {
    if (p.data.kind === "campaigns") {
      if (p.data.id) {
        const campaign = await getCampaign(
          p.data.id,
          p.data.access_token,
          10,
          p.data.offset,
        );
        return campaign
          ? Response.json({ campaign }, { headers })
          : Response.json(
              { error: "Campaign inaccessible" },
              { status: 404, headers },
            );
      }
      return Response.json(
        {
          campaigns: await searchCampaigns(
            p.data.query,
            p.data.access_token,
            20,
            p.data.offset,
            true,
          ),
        },
        { headers },
      );
    }
    if (p.data.id) {
      const record = await getExperiment(p.data.id, p.data.access_token);
      return record
        ? Response.json({ experiment: record }, { headers })
        : Response.json(
            { error: "Record inaccessible" },
            { status: 404, headers },
          );
    }
    return Response.json(
      {
        experiments: await searchExperiments({
          ...p.data,
          scope: "owned",
          limit: 20,
        }),
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Unable to load records" },
      { status: 503, headers },
    );
  }
}
