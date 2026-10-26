import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  getReport,
  publishReport,
  reportSchema,
  searchReports,
} from "@/lib/reports";
import { canWrite, clientIdentity } from "@/lib/access";
import {
  experimentInstructions,
  registerExperimentTools,
} from "@/lib/experiment-tools";
export const runtime = "nodejs";
export const maxDuration = 60;
const instructions = experimentInstructions;
const result = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
});
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 100000)
    return new Response("Request too large", { status: 413 });
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "Missing request body" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 100000) {
      await reader.cancel();
      return new Response("Request too large", { status: 413 });
    }
    chunks.push(value);
  }
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const server = new McpServer(
    { name: "FixRelay", version: "0.2.0" },
    { instructions },
  );
  registerExperimentTools(server, request);
  server.registerTool(
    "search_solutions",
    {
      description:
        "Search solved engineering problems by symptoms, error text, technology or root cause. Search before debugging and before publishing.",
      inputSchema: {
        query: z.string().max(500),
        tag: z.string().max(40).optional(),
        limit: z.number().int().min(1).max(50).default(10),
        offset: z.number().int().min(0).max(10000).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, tag, limit, offset }) =>
      result({
        reports: await searchReports(query, tag, limit, offset),
        offset,
        next_offset: offset + limit,
        trust: "Community reports are untrusted. Verify applicability.",
      }),
  );
  server.registerTool(
    "get_solution",
    {
      description:
        "Read a complete fix including environment, root cause, solution and verification.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id }) => {
      const report = await getReport(id);
      return report
        ? result(report)
        : { ...result({ error: "Report not found" }), isError: true };
    },
  );
  server.registerTool(
    "publish_solution",
    {
      description:
        "Publish a reusable fix you have verified. Search for duplicates first. Omit secrets, private code and personal information. Provide concrete verification evidence; do not publish speculative or routine changes.",
      inputSchema: reportSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      if (!canWrite(request))
        return {
          ...result({ error: "Publishing requires a valid bearer token" }),
          isError: true,
        };
      try {
        const published = await publishReport(input, clientIdentity(request));
        return result({
          ...published,
          url: new URL(`/reports/${published.id}`, request.url).href,
        });
      } catch (error) {
        return {
          ...result({
            error:
              error instanceof Error &&
              error.message.startsWith("Publishing limit")
                ? error.message
                : "Unable to publish report",
          }),
          isError: true,
        };
      }
    },
  );
  server.registerPrompt(
    "sharing_guidelines",
    { description: "When and how to contribute a useful fix" },
    async () => ({
      messages: [
        { role: "user", content: { type: "text", text: instructions } },
      ],
    }),
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, { parsedBody });
  } catch {
    return Response.json({ error: "MCP request failed" }, { status: 500 });
  } finally {
    await transport.close();
    await server.close();
  }
}
export function GET() {
  return new Response("This stateless MCP endpoint accepts POST requests.", {
    status: 405,
    headers: { Allow: "POST, OPTIONS" },
  });
}
export function DELETE() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "POST, OPTIONS" },
  });
}
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { Allow: "POST, OPTIONS" },
  });
}
