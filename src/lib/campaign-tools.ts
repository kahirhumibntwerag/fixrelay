import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  publishCampaign,
  campaignSchema,
  linkSchema,
  createCampaign,
  searchCampaigns,
  getCampaign,
  linkExperiments,
  getTrail,
  bounded,
  clip,
} from "./campaigns";
import { listReports, getReport, publishReport } from "./reproductions";
import { textChunk } from "./context";
import { accessTokenSchema, ExperimentError } from "./experiments";
import { canWrite, clientIdentity } from "./access";
const output = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
});
const read = { readOnlyHint: true, openWorldHint: true },
  write = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
const pageShape = {
  limit: z.number().int().min(1).max(20).default(5),
  offset: z.number().int().min(0).max(10000).default(0),
  max_chars: z.number().int().min(2000).max(10000).default(5000),
};
export function registerCampaignTools(server: McpServer, request: Request) {
  const identity = clientIdentity(request);
  async function guard(fn: () => Promise<unknown>) {
    if (!canWrite(request))
      return {
        ...output({ error: "Writing requires the operator bearer token" }),
        isError: true,
      };
    try {
      return output(await fn());
    } catch (e) {
      return {
        ...output({
          error:
            e instanceof ExperimentError
              ? e.message
              : "Unable to save record. Check input and availability.",
        }),
        isError: true,
      };
    }
  }
  server.registerTool(
    "create_campaign",
    {
      description:
        "Create a research question and short summary to organize experiments into a DAG. Private by default. Save and reuse the returned access_token for all campaign experiments.",
      inputSchema: campaignSchema.shape,
      annotations: { ...write, idempotentHint: false },
    },
    async (p) => guard(() => createCampaign(p, identity)),
  );
  server.registerTool(
    "publish_campaign",
    {
      description:
        "Publish your campaign question and summary with owner approval. Does not publish its experiments or reports; private nodes and their links remain hidden.",
      inputSchema: { id: z.string().uuid(), access_token: accessTokenSchema },
      annotations: write,
    },
    async (p) => guard(() => publishCampaign(p.id, p.access_token, identity)),
  );
  server.registerTool(
    "search_campaigns",
    {
      description:
        "Find compact campaign summaries without loading experiments. Follow pagination; character budgets bound context.",
      inputSchema: {
        query: z.string().max(500).default(""),
        access_token: accessTokenSchema.optional(),
        ...pageShape,
      },
      annotations: read,
    },
    async (p) => {
      const page = bounded(
        await searchCampaigns(p.query, p.access_token, p.limit, p.offset),
        p.offset,
        p.limit,
        p.max_chars,
      );
      return output({
        campaigns: page.items,
        next_offset: page.next_offset,
        truncated: page.truncated,
      });
    },
  );
  server.registerTool(
    "get_campaign",
    {
      description:
        "Read campaign reproduction coverage across all accessible steps plus one page of experiment titles/statuses/visible parent links. Completion is distinct from reproduction. Only accessible reports count. No protocols or reports are expanded. Private nodes/links are omitted.",
      inputSchema: {
        id: z.string().uuid(),
        access_token: accessTokenSchema.optional(),
        ...pageShape,
        max_chars: z.number().int().min(4000).max(10000).default(5000),
      },
      annotations: read,
    },
    async (p) => {
      const r = await getCampaign(p.id, p.access_token, p.limit, p.offset);
      if (!r)
        return { ...output({ error: "Campaign inaccessible" }), isError: true };
      const page = bounded(
        r.experiments.map((e) => ({
          ...e,
          parents: e.parents.map((parent) => ({
            ...parent,
            reason: clip(parent.reason as string, 100),
            title: clip(parent.title as string, 100),
          })),
        })),
        p.offset,
        p.limit,
        p.max_chars - 1500,
      );
      return output({
        campaign: {
          ...r.campaign,
          question: clip(r.campaign.question as string, 300),
          summary: clip(r.campaign.summary as string, 600),
        },
        experiments: page.items,
        next_offset: page.next_offset,
        truncated: page.truncated,
      });
    },
  );
  server.registerTool(
    "link_experiments",
    {
      description:
        "Add a parent→child link in your campaign. Rejects self-links, cycles, conflicting rewrites and experiments owned by others. Cycle checks serialize per campaign, including concurrent mutations.",
      inputSchema: linkSchema.shape,
      annotations: write,
    },
    async (p) => guard(() => linkExperiments(p, identity)),
  );
  server.registerTool(
    "get_experiment_trail",
    {
      description:
        "Read immediate visible parents or children only. Default three neighbors, depth one. Expand a selected neighbor explicitly; never loads an entire campaign.",
      inputSchema: {
        id: z.string().uuid(),
        access_token: accessTokenSchema.optional(),
        direction: z.enum(["parents", "children"]).default("parents"),
        ...pageShape,
        limit: z.number().int().min(1).max(20).default(3),
      },
      annotations: read,
    },
    async (p) => {
      const r = await getTrail(
        p.id,
        p.access_token,
        p.direction,
        p.limit,
        p.offset,
      );
      if (!r)
        return {
          ...output({ error: "Experiment inaccessible" }),
          isError: true,
        };
      const page = bounded(
        r.neighbors.map((n) => ({
          ...n,
          reason: clip(n.reason as string, 100),
        })),
        p.offset,
        p.limit,
        p.max_chars - 1200,
      );
      return output({
        ...r,
        neighbors: page.items,
        next_offset: page.next_offset,
        truncated: page.truncated,
      });
    },
  );
  server.registerTool(
    "list_reproduction_reports",
    {
      description:
        "Read compact reproduction verdicts for one experiment, five by default. Fetch full evidence by report ID only when needed. Unable-to-assess reports are obstacles, not refutations.",
      inputSchema: {
        experiment_id: z.string().uuid(),
        access_token: accessTokenSchema.optional(),
        ...pageShape,
      },
      annotations: read,
    },
    async (p) => {
      const rows = await listReports(
        p.experiment_id,
        p.access_token,
        p.limit,
        p.offset,
      );
      if (!rows)
        return {
          ...output({ error: "Experiment inaccessible" }),
          isError: true,
        };
      const page = bounded(rows, p.offset, p.limit, p.max_chars);
      return output({
        reports: page.items,
        next_offset: page.next_offset,
        truncated: page.truncated,
      });
    },
  );
  server.registerTool(
    "get_reproduction_report",
    {
      description:
        "Fetch one reproduction report as bounded JSON text. Follow character next_offset for more; no other reports or campaign are expanded.",
      inputSchema: {
        id: z.string().uuid(),
        access_token: accessTokenSchema.optional(),
        offset: z.number().int().min(0).max(100000).default(0),
        max_chars: z.number().int().min(1000).max(12000).default(4000),
      },
      annotations: read,
    },
    async (p) => {
      const r = await getReport(p.id, p.access_token);
      return r
        ? output({ id: p.id, ...textChunk(r, p.offset, p.max_chars) })
        : { ...output({ error: "Report inaccessible" }), isError: true };
    },
  );
  server.registerTool(
    "publish_reproduction_report",
    {
      description:
        "Publish a direct report after owner approval using its own token. Original experiment must be public. For legacy linked reports publish the replication experiment instead.",
      inputSchema: { id: z.string().uuid(), access_token: accessTokenSchema },
      annotations: write,
    },
    async (p) => guard(() => publishReport(p.id, p.access_token, identity)),
  );
}
