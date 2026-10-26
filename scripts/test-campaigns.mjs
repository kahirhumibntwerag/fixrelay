import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { neon } from "@neondatabase/serverless";
const base = process.argv[2] || "http://localhost:3000";
if (!process.env.DATABASE_URL)
  throw new Error("Database required for exact fixture cleanup.");
const sql = neon(process.env.DATABASE_URL),
  campaigns = [],
  ids = [],
  marker = randomUUID(),
  token = randomBytes(32).toString("base64url"),
  other = randomBytes(32).toString("base64url");
const client = new Client({ name: "campaign-mvp-test", version: "0.3.0" });
const local = new URL(base).hostname === "localhost";
await client.connect(
  new StreamableHTTPClientTransport(
    new URL("/mcp", base),
    local
      ? {
          requestInit: {
            headers: { "x-vercel-forwarded-for": `test-${marker}` },
          },
        }
      : undefined,
  ),
);
const call = (name, args) => client.callTool({ name, arguments: args });
const data = (r) => {
  assert(!r.isError, JSON.stringify(r));
  return JSON.parse(r.content[0].text);
};
const plan = {
  title: `MVP integration fixture ${marker}`,
  question: "Does the campaign registry preserve privacy and bounded context?",
  hypothesis:
    "Linked experiment metadata stays bounded and private by default.",
  method:
    "Software integration fixture only. Verify campaign DAG, bounded reads and direct reproduction reports using official MCP SDK assertions. ".repeat(
      30,
    ),
  inputs: "Synthetic software fixtures. Code and data versions: fixture-v1.",
  conditions: "Integration test environment; no scientific claim is made.",
  success_criteria:
    "All isolation, graph and reproduction-report assertions pass.",
  tags: ["integration-test"],
  agent: "MVP integration runner",
  access_token: token,
};
const reg = async (extra = {}) => {
  const r = data(await call("register_experiment", { ...plan, ...extra }));
  ids.push(r.id);
  return r;
};
try {
  const c = data(
    await call("create_campaign", {
      title: `Campaign fixture ${marker}`,
      question: plan.question,
      summary:
        "Synthetic integration fixture for campaign privacy and bounded experiment trails.",
      access_token: token,
    }),
  );
  campaigns.push(c.id);
  assert.equal(
    data(
      await call("create_campaign", {
        title: `Campaign fixture ${marker}`,
        question: plan.question,
        summary:
          "Synthetic integration fixture for campaign privacy and bounded experiment trails.",
        access_token: token,
      }),
    ).id,
    c.id,
  );
  assert((await call("get_campaign", { id: c.id })).isError);
  assert.equal((await fetch(`${base}/campaigns/${c.id}`)).status, 404);
  const a = await reg({ campaign_id: c.id, title: `Parent fixture ${marker}` });
  const b = await reg({
    campaign_id: c.id,
    title: `Child fixture ${marker}`,
    parents: [
      { id: a.id, reason: "The parent result motivates this follow-up." },
    ],
  });
  const d = await reg({ campaign_id: c.id, title: `Third fixture ${marker}` });
  assert(
    (
      await call("register_experiment", {
        ...plan,
        campaign_id: c.id,
        access_token: other,
      })
    ).isError,
  );
  const brokenTitle = `Rolled back fixture ${marker}`;
  assert(
    (
      await call("register_experiment", {
        ...plan,
        title: brokenTitle,
        campaign_id: c.id,
        parents: [
          {
            id: randomUUID(),
            reason: "This missing parent must roll back registration.",
          },
        ],
      })
    ).isError,
  );
  assert.equal(
    (await sql`SELECT id FROM experiments WHERE title=${brokenTitle}`).length,
    0,
  );
  const edge = {
    campaign_id: c.id,
    parent_id: b.id,
    child_id: d.id,
    reason: "Follow the second experiment in the campaign.",
    access_token: token,
  };
  data(await call("link_experiments", edge));
  data(await call("link_experiments", edge));
  assert(
    (
      await call("link_experiments", {
        ...edge,
        parent_id: d.id,
        child_id: a.id,
      })
    ).isError,
  );
  assert(
    (
      await call("link_experiments", {
        ...edge,
        reason: "A conflicting rewrite should be rejected.",
      })
    ).isError,
  );
  const x = await reg({
      campaign_id: c.id,
      title: `Concurrent X fixture ${marker}`,
    }),
    y = await reg({
      campaign_id: c.id,
      title: `Concurrent Y fixture ${marker}`,
    });
  const racing = await Promise.all([
    call("link_experiments", { ...edge, parent_id: x.id, child_id: y.id }),
    call("link_experiments", { ...edge, parent_id: y.id, child_id: x.id }),
  ]);
  assert.equal(racing.filter((r) => !r.isError).length, 1);
  const page = data(
    await call("get_campaign", {
      id: c.id,
      access_token: token,
      limit: 1,
      max_chars: 4000,
    }),
  );
  assert.equal(page.experiments.length, 1);
  assert.equal(page.next_offset, 1);
  assert(!JSON.stringify(page).includes(plan.method));
  assert.equal(
    data(
      await call("get_campaign", {
        id: c.id,
        access_token: token,
        limit: 1,
        offset: 1,
      }),
    ).experiments[0].id,
    b.id,
  );
  const trail = data(
    await call("get_experiment_trail", { id: d.id, access_token: token }),
  );
  assert.equal(trail.depth, 1);
  assert.equal(trail.neighbors[0].id, b.id);
  assert(!JSON.stringify(trail.neighbors).includes(a.id));
  console.log(
    "PASS: private campaigns, atomic parent registration, immutable links, cycle rejection including concurrent links, paginated one-hop trails",
  );
  data(await call("publish_experiment", { id: b.id, access_token: token }));
  assert.equal(data(await call("get_experiment", { id: b.id })).campaign, null);
  data(await call("publish_campaign", { id: c.id, access_token: token }));
  const publicPage = data(await call("get_campaign", { id: c.id }));
  assert.equal(publicPage.experiments.length, 1);
  assert.deepEqual(publicPage.experiments[0].parents, []);
  assert.deepEqual(
    data(await call("get_experiment_trail", { id: b.id })).neighbors,
    [],
  );
  assert.equal(
    data(await call("get_experiment", { id: b.id })).campaign.id,
    c.id,
  );
  assert(
    (await call("publish_campaign", { id: c.id, access_token: other })).isError,
  );
  assert.equal((await fetch(`${base}/campaigns/${c.id}`)).status, 200);
  const search = data(
    await call("search_experiments", { query: marker, max_chars: 2000 }),
  );
  assert(
    search.experiments.every(
      (e) => !("method" in e) && !("reproductions" in e),
    ),
  );
  assert(JSON.stringify(search).length < 2600);
  let content = "",
    offset = 0;
  do {
    const chunk = data(
      await call("get_experiment", {
        id: b.id,
        section: "protocol",
        offset,
        max_chars: 1000,
      }),
    );
    assert(chunk.content.length <= 1000);
    content += chunk.content;
    offset = chunk.next_offset;
  } while (offset !== null);
  assert.equal(JSON.parse(content).method, plan.method.trim());
  console.log(
    "PASS: publication isolation, hidden parent links, compact search and lossless chunked protocol reads",
  );
  data(
    await call("record_outcome", {
      id: b.id,
      access_token: token,
      outcome: "supported",
      observations:
        "Synthetic software integration result; no scientific claim.",
      evidence:
        "The fixture checks annotation persistence and public/private visibility.",
      limitations:
        "Synthetic registry test, not an independent scientific assessment.",
    }),
  );
  const report = {
    experiment_id: b.id,
    agent: "Independent fixture runner",
    conditions: "Separate synthetic verification context, fixture-v1.",
    access_token: other,
    result: "unable_to_assess",
    observations:
      "Synthetic installation obstacle prevents assessment of the finding.",
    evidence:
      "Synthetic fixture assertion checks obstacles do not refute findings.",
    differences: "Software fixture only; no actual scientific reproduction.",
    visibility: "public",
  };
  const blocked = data(await call("submit_reproduction", report));
  assert.equal(data(await call("submit_reproduction", report)).id, blocked.id);
  assert.equal(
    data(await call("get_experiment", { id: b.id })).not_reproduced_count,
    0,
  );
  assert.equal(
    data(await call("get_campaign", { id: c.id })).campaign.reproduction.status,
    "unresolved",
  );
  const negative = data(
    await call("submit_reproduction", {
      ...report,
      result: "not_reproduced",
      visibility: "private",
    }),
  );
  assert.equal(
    data(await call("get_experiment", { id: b.id })).not_reproduced_count,
    0,
  );
  assert(
    (
      await call("publish_reproduction_report", {
        id: negative.id,
        access_token: token,
      })
    ).isError,
  );
  data(
    await call("publish_reproduction_report", {
      id: negative.id,
      access_token: other,
    }),
  );
  assert.equal(
    data(await call("get_experiment", { id: b.id })).reproduction_status,
    "not_reproduced",
  );
  const reports = data(
    await call("list_reproduction_reports", { experiment_id: b.id }),
  );
  assert.equal(reports.reports.length, 2);
  assert(
    reports.reports.every(
      (r) => r.reproduction_id === null && !("evidence" in r),
    ),
  );
  const full = data(await call("get_reproduction_report", { id: negative.id }));
  assert.equal(JSON.parse(full.content).conditions, report.conditions);
  const positive = data(
    await call("submit_reproduction", {
      ...report,
      result: "reproduced",
      visibility: "private",
    }),
  );
  assert.equal(
    data(await call("get_campaign", { id: c.id })).campaign.reproduction.status,
    "not_reproduced",
  );
  assert.equal(
    data(await call("get_campaign", { id: c.id, access_token: other })).campaign
      .reproduction.status,
    "mixed",
  );
  const privateEvidence = await fetch(base + "/api/experiments/private", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "campaigns", id: c.id, access_token: other }),
  });
  assert.equal(privateEvidence.headers.get("cache-control"), "no-store");
  assert.equal(
    (await privateEvidence.json()).campaign.campaign.reproduction.status,
    "mixed",
  );
  data(
    await call("publish_reproduction_report", {
      id: positive.id,
      access_token: other,
    }),
  );
  assert.equal(
    data(await call("get_campaign", { id: c.id })).campaign.reproduction.status,
    "mixed",
  );
  assert.equal(
    data(await call("get_experiment", { id: b.id })).reproduction_status,
    "mixed",
  );
  assert.equal(
    data(await call("get_experiment", { id: b.id })).reproducing_agent_count,
    1,
  );
  data(
    await call("submit_reproduction", {
      ...report,
      result: "reproduced",
      observations:
        "A second successful report from the same contributor must not add an agent.",
    }),
  );
  assert.equal(
    data(await call("get_experiment", { id: b.id })).reproducing_agent_count,
    1,
  );
  data(
    await call("submit_reproduction", {
      ...report,
      result: "reproduced",
      access_token: randomBytes(32).toString("base64url"),
    }),
  );
  const counted = data(await call("get_campaign", { id: c.id }));
  assert.equal(counted.campaign.reproduction.reproducing_agents, 2);
  assert.equal(counted.campaign.reproduction.fully_reproducing_agents, 2);
  assert.equal(counted.experiments[0].reproducing_agent_count, 2);
  assert(!JSON.stringify(counted).includes("reproducing_agent_keys"));
  const detail = data(await call("get_experiment", { id: b.id }));
  assert.equal(detail.reproducing_agent_count, 2);
  const section = data(
    await call("get_experiment", { id: b.id, section: "result" }),
  );
  assert(!JSON.stringify(section).includes("report_owner_key"));
  console.log(
    "PASS: cumulative distinct contributor counts, repeat-report deduplication and no identity key disclosure",
  );
  assert.equal(
    Number(
      (
        await sql`SELECT count(*) AS n FROM experiments WHERE campaign_id=${c.id}`
      )[0].n,
    ),
    5,
  );
  console.log(
    "PASS: direct reports without extra experiments, retry deduplication, unable-to-assess distinction, owner publication and mixed annotations",
  );
} finally {
  await client.close();
  for (const id of campaigns)
    await sql`DELETE FROM experiment_links WHERE campaign_id=${id}`;
  for (const id of ids)
    await sql`DELETE FROM reproduction_reports WHERE experiment_id=${id} OR reproduction_id=${id}`;
  for (const id of [...ids].reverse())
    await sql`DELETE FROM experiments WHERE id=${id}`;
  for (const id of campaigns) await sql`DELETE FROM campaigns WHERE id=${id}`;
  console.log(
    `Cleaned ${ids.length} experiments and ${campaigns.length} campaigns.`,
  );
}
