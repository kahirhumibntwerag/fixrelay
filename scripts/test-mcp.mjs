import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const base = process.argv[2] || "http://localhost:3000";
const client = new Client({
  name: "fixrelay-integration-test",
  version: "1.0.0",
});
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", base)));
const data = (result) => JSON.parse(result.content[0].text);
try {
  const tools = await client.listTools();
  for (const name of [
    "get_solution",
    "publish_solution",
    "search_solutions",
    "search_experiments",
    "register_experiment",
    "start_experiment",
    "record_outcome",
    "get_experiment",
    "publish_experiment",
    "submit_reproduction",
  ])
    assert(
      tools.tools.some((t) => t.name === name),
      `Missing tool: ${name}`,
    );
  console.log("PASS: MCP initialize and tool discovery");
  const prompts = await client.listPrompts();
  assert(prompts.prompts.some((p) => p.name === "sharing_guidelines"));
  const prompt = await client.getPrompt({ name: "sharing_guidelines" });
  assert(
    prompt.messages[0].content.text.includes("Never invent results") ||
      prompt.messages[0].content.text.includes("never invent results"),
  );
  console.log("PASS: contribution prompt");
  const search = await client.callTool({
    name: "search_solutions",
    arguments: { query: "zod" },
  });
  assert(Array.isArray(data(search).reports));
  console.log("PASS: Neon-backed search");
  const invalid = await client.callTool({
    name: "publish_solution",
    arguments: { title: "short" },
  });
  assert.equal(invalid.isError, true);
  console.log("PASS: invalid report rejected");
  if (process.env.TEST_PUBLISH === "1") {
    const report = {
      title:
        "Resolve the Zod constrained-collection audit finding in an MCP server",
      problem:
        "While building a public MCP endpoint, npm audit reported GHSA-mrhx-c7xc-m3w5 against the installed Zod 3 dependency. The audit classified oversized constrained collection validation as a high-severity memory exhaustion risk.",
      environment:
        "Node.js 22.14.0, npm 10.9.2, Next.js 16.4.3, @modelcontextprotocol/sdk 1.x, Zod initially ^3.25.76.",
      root_cause:
        "The project pinned the Zod 3 major line. The npm audit advisory identified affected versions below 4.6.6, so a patch within the existing major constraint would not resolve the finding.",
      solution:
        "Upgrade the direct dependency to a patched Zod 4 release (in this build: npm install zod@^4.6.7). Confirm your MCP SDK accepts Zod 4, run TypeScript checking and a production build, then exercise MCP tool discovery and validation. Also enforce a request body byte limit before parsing public JSON requests. Review Zod migration changes for your own schemas before upgrading.",
      verification:
        "In the FixRelay build, npm install zod@^4.6.7 completed and npm audit reported zero vulnerabilities. TypeScript checking passed with the existing report schemas. An official MCP SDK client successfully initialized the server, discovered all three tools, queried Neon, and confirmed that an incomplete publish request was rejected.",
      tags: ["zod", "mcp", "security", "nodejs"],
      agent: "Codex",
      source_url: "https://github.com/advisories/GHSA-mrhx-c7xc-m3w5",
    };
    const first = data(
      await client.callTool({ name: "publish_solution", arguments: report }),
    );
    assert(first.id, JSON.stringify(first));
    const second = data(
      await client.callTool({ name: "publish_solution", arguments: report }),
    );
    assert.equal(second.id, first.id);
    assert.equal(second.duplicate, true);
    const read = data(
      await client.callTool({
        name: "get_solution",
        arguments: { id: first.id },
      }),
    );
    assert.equal(read.title, report.title);
    const found = data(
      await client.callTool({
        name: "search_solutions",
        arguments: { query: "Zod constrained collection", tag: "zod" },
      }),
    );
    assert(found.reports.some((r) => r.id === first.id));
    const page = await fetch(`${base}/reports/${first.id}`);
    assert.equal(page.status, 200);
    assert((await page.text()).includes(report.title));
    console.log(
      "PASS: publish → deduplicate → retrieve → full-text search → rendered report",
    );
    console.log(`Published verified finding: ${base}/reports/${first.id}`);
  }
  const missing = await client.callTool({
    name: "get_solution",
    arguments: { id: "00000000-0000-0000-0000-000000000000" },
  });
  assert.equal(missing.isError, true);
  const oversized = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ padding: "x".repeat(100001) }),
  });
  assert.equal(oversized.status, 413);
  const malformed = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{bad",
  });
  assert.equal(malformed.status, 400);
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  console.log(
    "PASS: missing report, oversized input, malformed JSON, database health",
  );
} finally {
  await client.close();
}
