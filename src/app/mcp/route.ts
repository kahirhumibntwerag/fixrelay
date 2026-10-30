import {
  createMcpHandler,
  McpServer,
  hostHeaderValidationResponse,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import {
  registerResearchTools,
  researchInstructions,
} from "@/lib/research-tools";
import {
  assertResearchScope,
  requirePrincipal,
  type Principal,
} from "@/lib/auth-access";
import { oauthChallenge } from "@/lib/oauth";
import { researchToolScope, toolSecuritySchemes } from "@/lib/mcp-auth";
export const runtime = "nodejs";
export const maxDuration = 60;
const maxMcpBodySize = 3 * 1024 * 1024;
const handler = createMcpHandler(
  ({ requestInfo, authInfo }) => {
    if (!requestInfo) throw new Error("HTTP request context is required");
    const server = new McpServer(
      { name: "RogNet Research Observatory", version: "0.5.0" },
      { instructions: researchInstructions },
    );
    registerResearchTools(
      server,
      requestInfo,
      authInfo?.extra?.principal as Principal | undefined,
    );
    return server;
  },
  {
    legacy: "stateless",
    responseMode: "json",
    maxRequestBodySize: maxMcpBodySize,
  },
);
function allowedHosts(request: Request) {
  const values = [
    process.env.BETTER_AUTH_URL,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.VERCEL_PROJECT_PRODUCTION_URL &&
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
  ];
  if (process.env.NODE_ENV !== "production")
    values.push("http://localhost", "http://127.0.0.1", "http://[::1]");
  const configured = values
    .filter((v): v is string => Boolean(v))
    .map((v) => new URL(v).hostname);
  return [
    ...new Set(
      configured.length ? configured : [new URL(request.url).hostname],
    ),
  ];
}
async function serve(request: Request) {
  const hosts = allowedHosts(request);
  const rejected =
    hostHeaderValidationResponse(request, hosts) ??
    originValidationResponse(request, hosts);
  if (rejected) return rejected;
  let checked = request;
  let verifiedPrincipal: Principal | undefined;
  let body: Record<string, unknown> | undefined;
  if (request.method === "POST") {
    // Read once with the same hard limit as the transport, then pass the bytes
    // onward. Authentication never requires an unbounded request clone.
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json({ error: "Missing request body" }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxMcpBodySize) {
        await reader.cancel();
        return Response.json({ error: "Request too large" }, { status: 413 });
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    try {
      const parsed: unknown = JSON.parse(bytes.toString("utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        body = parsed as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const params = body?.params as { name?: unknown } | undefined;
    const isChartUpload =
      body?.method === "tools/call" && params?.name === "upload_chart";
    if (!isChartUpload && size > 100000)
      return Response.json({ error: "Request too large" }, { status: 413 });
    checked = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: bytes,
      signal: request.signal,
    });
    const scope =
      body?.method === "tools/call" && typeof params?.name === "string"
        ? researchToolScope(params.name)
        : null;
    if (scope) {
      try {
        // MCP account linking always uses a bearer credential. A browser session
        // does not silently authorize a third-party agent.
        if (!request.headers.get("authorization"))
          throw Object.assign(
            new Error("Connect your RogNet account to use this tool"),
            { status: 401 },
          );
        const principal = await requirePrincipal(checked);
        assertResearchScope(principal, scope === "research:write");
        verifiedPrincipal = principal;
      } catch (error) {
        const status =
          error && typeof error === "object" && "status" in error
            ? Number(error.status)
            : 500;
        if (
          status === 401 ||
          (status === 403 &&
            error &&
            typeof error === "object" &&
            "oauthScope" in error)
        ) {
          const challenge = oauthChallenge(
            scope,
            status === 403 ? "insufficient_scope" : "invalid_token",
          );
          return Response.json(
            {
              ...(body?.jsonrpc ? { jsonrpc: body.jsonrpc } : {}),
              id: body?.id ?? null,
              error: {
                code: -32001,
                message:
                  error instanceof Error
                    ? error.message
                    : "Account authorization required",
              },
              _meta: { "mcp/www_authenticate": [challenge] },
            },
            {
              status,
              headers: {
                "WWW-Authenticate": challenge,
                "Cache-Control": "no-store",
              },
            },
          );
        }
        return Response.json(
          { error: "Authentication service unavailable. Please retry." },
          { status: status >= 500 ? 503 : status },
        );
      }
    }
  }
  let response = await handler.fetch(
    checked,
    verifiedPrincipal
      ? {
          authInfo: {
            token:
              request.headers
                .get("authorization")
                ?.split(" ")
                .slice(1)
                .join(" ") || "",
            clientId:
              verifiedPrincipal.oauthClientId ||
              verifiedPrincipal.keyId ||
              "agent",
            scopes: verifiedPrincipal.scopes || [
              "research:read",
              "research:write",
            ],
            extra: { principal: verifiedPrincipal },
          },
        }
      : undefined,
  );
  if (
    body?.method === "tools/list" &&
    response.headers.get("content-type")?.includes("application/json")
  ) {
    const result = await response.json();
    if (Array.isArray(result.result?.tools))
      for (const tool of result.result.tools)
        tool.securitySchemes = toolSecuritySchemes(tool.name);
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    response = new Response(JSON.stringify(result), {
      status: response.status,
      headers,
    });
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export const POST = serve;
export const GET = serve;
export const DELETE = serve;
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { Allow: "POST, GET, DELETE, OPTIONS" },
  });
}
