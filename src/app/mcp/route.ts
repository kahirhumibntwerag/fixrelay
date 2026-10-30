import { createMcpHandler, McpServer, hostHeaderValidationResponse, originValidationResponse } from "@modelcontextprotocol/server";
import { registerResearchTools, researchInstructions } from "@/lib/research-tools";
export const runtime = "nodejs";
export const maxDuration = 60;
const handler = createMcpHandler(({ requestInfo }) => {
  if (!requestInfo) throw new Error("HTTP request context is required");
  const server = new McpServer({ name: "RogNet Research Observatory", version: "0.4.0" }, { instructions: researchInstructions });
  registerResearchTools(server, requestInfo);
  return server;
}, { legacy: "stateless", responseMode: "json", maxRequestBodySize: 100000 });
function allowedHosts(request: Request) {
  const values = [process.env.BETTER_AUTH_URL, process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`];
  if (process.env.NODE_ENV !== "production") values.push("http://localhost", "http://127.0.0.1", "http://[::1]");
  const configured = values.filter((v): v is string => Boolean(v)).map(v => new URL(v).hostname);
  return [...new Set(configured.length ? configured : [new URL(request.url).hostname])];
}
async function serve(request: Request) {
  const hosts = allowedHosts(request);
  const rejected = hostHeaderValidationResponse(request, hosts) ?? originValidationResponse(request, hosts);
  if (rejected) return rejected;
  const response = await handler.fetch(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export const POST = serve;
export const GET = serve;
export const DELETE = serve;
export function OPTIONS() { return new Response(null, { status: 204, headers: { Allow: "POST, GET, DELETE, OPTIONS" } }); }
