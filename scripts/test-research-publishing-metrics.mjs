import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { connectResearch, toolData } from "./demo-research.mjs";

const base = new URL(process.argv[2] || "http://localhost:3001").origin;
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname),
  "Use a disposable local database for this write-based suite",
);
const password = randomBytes(24).toString("base64url");
const localTestHeaders = {
  "x-forwarded-for": `127.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${Math.max(1, randomBytes(1)[0])}`,
};
const clients = [];
async function account() {
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base, ...localTestHeaders },
    body: JSON.stringify({
      name: "SYNTHETIC metric/publishing test",
      email: `metrics-${randomUUID()}@example.test`,
      password,
    }),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  const cookie = response.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  const key = await fetch(`${base}/api/agent-keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      Cookie: cookie,
      ...localTestHeaders,
    },
    body: JSON.stringify({ name: "SYNTHETIC multi-metric worker" }),
  });
  assert.equal(key.status, 201);
  const credential = await key.json();
  const client = await connectResearch(
    base,
    credential.token,
    "rognet-multi-metric-test",
  );
  clients.push(client);
  return { cookie, token: credential.token, client };
}
async function invoke(client, name, input, idempotency_key = randomUUID()) {
  return toolData(
    await client.callTool({ name, arguments: { ...input, idempotency_key } }),
  );
}
async function denied(client, name, input, expected) {
  try {
    const result = await client.callTool({
      name,
      arguments: { ...input, idempotency_key: randomUUID() },
    });
    assert.equal(result.isError, true, `${name} must fail`);
    const value =
      result.structuredContent ||
      JSON.parse(result.content.find((entry) => entry.type === "text").text);
    assert.equal(value.status, expected, JSON.stringify(value));
  } catch (error) {
    if (error.code === "ERR_ASSERTION") throw error;
    const status =
      error.status ||
      error.statusCode ||
      error.data?.status ||
      (error.name === "UnauthorizedError"
        ? 401
        : error.name === "InsufficientScopeError"
          ? 403
          : undefined);
    assert.equal(status, expected, String(error));
  }
}
async function apiMutation(owner, action, input) {
  const response = await fetch(`${base}/api/research`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${owner.token}`,
    },
    body: JSON.stringify({ action, input, idempotency_key: randomUUID() }),
  });
  return { response, data: await response.json() };
}
const protocol =
  "SYNTHETIC fixed metric protocol; invented fixture values, no scientific execution.";
const input = {
  title: "SYNTHETIC multiple metric publishing",
  question:
    "Can one campaign register and publish several independent measurements?",
  summary: "Local integration fixture only; these are invented test values.",
  objective: "Verify multiple metric recording and delegated owner publication",
};
const rmse = {
  name: "RMSE",
  unit: "km/s",
  direction: "minimize",
  baseline: 10,
  target: 8,
  evaluation_protocol: protocol,
};
const csi = {
  name: "CSI",
  unit: "fraction",
  direction: "maximize",
  baseline: 0.4,
  target: 0.5,
  evaluation_protocol: protocol,
};

try {
  const owner = await account();
  const foreign = await account();
  const discovery = await owner.client.listTools();
  for (const name of ["register_metric", "publish_campaign", "create_comparison_table", "remove_metric", "remove_chart", "remove_comparison_table"]) {
    const tool = discovery.tools.find((entry) => entry.name === name);
    assert(tool, `MCP must advertise ${name}`);
    assert.deepEqual(tool._meta.securitySchemes, [
      { type: "oauth2", scopes: ["research:write"] },
    ]);
    if (name.startsWith("remove_")) assert.equal(tool.annotations.destructiveHint, true);
  }
  assert.equal(
    discovery.tools.find((entry) => entry.name === "publish_campaign")
      .annotations.openWorldHint,
    true,
  );
  for (const invalid of [
    { ...input },
    { ...input, metric: rmse, metrics: [csi] },
    { ...input, metrics: [rmse, { ...rmse, name: "rmse" }] },
    { ...input, metric: { ...rmse, direction: "range" } },
  ]) {
    assert.equal(
      (await apiMutation(owner, "create_campaign", invalid)).response.status,
      400,
    );
  }
  const legacy = await invoke(owner.client, "create_campaign", {
    ...input,
    title: "SYNTHETIC legacy single metric",
    metric: rmse,
  });
  assert.deepEqual(legacy.metric_ids, [legacy.metric_id]);
  await denied(owner.client, "remove_metric", { campaign_id: legacy.id, metric_id: legacy.metric_id }, 409);
  const campaign = await invoke(owner.client, "create_campaign", {
    ...input,
    metrics: [rmse, csi],
  });
  assert.equal(campaign.metric_ids.length, 2);
  assert.equal(campaign.metric_id, campaign.metric_ids[0]);
  const scope = { campaign_id: campaign.id };
  const removable = await invoke(owner.client, "register_metric", { ...scope, metric: { ...rmse, name: "SYNTHETIC removable metric" } });
  await denied(foreign.client, "remove_metric", { ...scope, metric_id: removable.metric_id }, 403);
  const removeMetricKey = randomUUID();
  const removeMetricInput = { ...scope, metric_id: removable.metric_id };
  const removedMetric = await invoke(owner.client, "remove_metric", removeMetricInput, removeMetricKey);
  assert.equal(removedMetric.removed, true);
  assert.deepEqual(await invoke(owner.client, "remove_metric", removeMetricInput, removeMetricKey), removedMetric);
  await denied(owner.client, "remove_metric", removeMetricInput, 404);
  const tableInput = { ...scope, title: "SYNTHETIC comparison", caption: "Invented values; units in headers.", columns: ["Method", "Accuracy (%)"], rows: [["Baseline", 82], ["Candidate", 87]] };
  const tableKey = randomUUID();
  const table = await invoke(owner.client, "create_comparison_table", tableInput, tableKey);
  assert.equal((await invoke(owner.client, "create_comparison_table", tableInput, tableKey)).table_id, table.table_id);
  await denied(owner.client, "create_comparison_table", { ...tableInput, rows: [["bad", 1, 2]] }, 400);
  await denied(foreign.client, "create_comparison_table", tableInput, 403);
  const hidden = await invoke(owner.client, "create_comparison_table", { ...tableInput, title: "SYNTHETIC private table" });
  const beforePublication = await fetch(`${base}/api/research/tables?campaign_id=${campaign.id}&public=true`);
  assert.deepEqual((await beforePublication.json()).tables, []);
  const privateTables = toolData(await owner.client.callTool({ name: "list_comparison_tables", arguments: scope }));
  assert.equal(privateTables.tables.length, 2);
  assert.deepEqual(privateTables.tables[0].rows, tableInput.rows);
  await denied(foreign.client, "list_comparison_tables", scope, 403);
  // The app has no membership-editing API; use the disposable local DB only
  // when supplied to verify that a write-capable researcher is not an owner.
  if (process.env.DATABASE_URL) {
    assert(["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL).hostname), "Membership fixtures require a local test database");
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
      const profile = toolData(await foreign.client.callTool({ name: "get_profile", arguments: {} }));
      await db.query("INSERT INTO research_campaign_members(campaign_id,user_id,role) VALUES($1,$2,'researcher')", [campaign.id, profile.id]);
      await denied(foreign.client, "remove_comparison_table", { ...scope, table_id: hidden.table_id }, 403);
      const memberSnapshot = await fetch(`${base}/api/research?campaign_id=${campaign.id}`, { headers: { Cookie: foreign.cookie } });
      assert.equal((await memberSnapshot.json()).campaign.role, "researcher");
      await db.query("DELETE FROM research_campaign_members WHERE campaign_id=$1 AND user_id=$2", [campaign.id, profile.id]);
    } finally { await db.end(); }
  }
  const initial = toolData(
    await owner.client.callTool({ name: "get_campaign", arguments: scope }),
  );
  assert.deepEqual(
    initial.metrics.map((metric) => metric.id),
    campaign.metric_ids,
    "First supplied metric stays primary",
  );
  const metricInput = {
    ...scope,
    metric: {
      name: "Latency",
      unit: "ms",
      direction: "range",
      target: 100,
      target_max: 200,
      evaluation_protocol: protocol,
    },
  };
  const retryKey = randomUUID();
  const latency = await invoke(
    owner.client,
    "register_metric",
    metricInput,
    retryKey,
  );
  assert.equal(
    (await invoke(owner.client, "register_metric", metricInput, retryKey))
      .metric_id,
    latency.metric_id,
  );
  await denied(owner.client, "register_metric", metricInput, 409);
  await denied(
    foreign.client,
    "register_metric",
    { ...scope, metric: { ...rmse, name: "Foreign metric" } },
    403,
  );
  console.log(
    "PASS: MCP metric discovery, legacy compatibility, ordered multi-metric creation, validation, registration, retry safety and ownership",
  );

  const h = await invoke(owner.client, "create_hypothesis", {
    ...scope,
    title: "SYNTHETIC measurement fixture",
    statement:
      "Several metric definitions remain distinct within one campaign.",
    rationale:
      "Exercise metric-linked observations with fixed synthetic values.",
    prediction: "All three metric IDs appear independently in the summary.",
  });
  const experimentInput = {
    ...scope,
    hypothesis_id: h.id,
    title: "SYNTHETIC three-metric experiment",
    method: "Record invented integration fixtures; no scientific execution.",
    inputs: "Synthetic fixture only",
    conditions: protocol,
    success_criteria: "Metric IDs, units and protocols remain independent",
  };
  const experiment = await invoke(
    owner.client,
    "propose_experiment",
    experimentInput,
  );
  const privateExperiment = await invoke(owner.client, "propose_experiment", {
    ...experimentInput,
    title: "SYNTHETIC unselected private experiment",
  });
  await denied(
    owner.client,
    "publish_campaign",
    { ...scope, experiment_ids: [privateExperiment.id] },
    409,
  );
  await denied(
    owner.client,
    "publish_campaign",
    { ...scope, experiment_ids: [] },
    400,
  );
  const run = await invoke(owner.client, "start_experiment_run", {
    ...scope,
    experiment_id: experiment.id,
    configuration: { synthetic: true },
    task: "Record synthetic API fixture values",
  });
  const recorded = [];
  for (const [metric_id, unit, value] of [
    [campaign.metric_ids[0], "km/s", 9],
    [campaign.metric_ids[1], "fraction", 0.45],
    [latency.metric_id, "ms", 150],
  ]) {
    recorded.push(
      await invoke(owner.client, "record_observation", {
        ...scope,
        run_id: run.id,
        metric_id,
        unit,
        value,
        evidence:
          "SYNTHETIC fixture: invented integration values, not empirical research",
        conditions_key: protocol,
      }),
    );
  }
  await denied(owner.client, "remove_metric", { ...scope, metric_id: campaign.metric_id }, 409);
  await invoke(owner.client, "record_observation", {
    ...scope,
    run_id: run.id,
    metric_id: campaign.metric_id,
    unit: "km/s",
    value: 0.01,
    evidence: "SYNTHETIC incompatible fixture must be excluded",
    conditions_key: "A different protocol",
  });
  await invoke(owner.client, "complete_experiment_run", {
    ...scope,
    run_id: run.id,
    status: "completed",
    outcome: "inconclusive",
    summary: "Synthetic integration fixture recorded; no scientific finding.",
  });
  await invoke(owner.client, "record_observation", {
    ...scope,
    run_id: run.id,
    metric_id: campaign.metric_id,
    unit: "km/s",
    value: 9.5,
    supersedes_id: recorded[0].id,
    evidence: "SYNTHETIC corrected fixture value",
    conditions_key: protocol,
  });
  const snapshotResponse = await fetch(
    `${base}/api/research?campaign_id=${campaign.id}`,
    { headers: { Cookie: owner.cookie } },
  );
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await snapshotResponse.json();
  assert.equal(snapshot.summary.metric_results.length, 3);
  const summaries = new Map(
    snapshot.summary.metric_results.map((item) => [item.metric_id, item]),
  );
  assert.equal(
    summaries.get(campaign.metric_ids[0]).best_result.value,
    9.5,
    "Ignore superseded and incompatible measurements",
  );
  assert.equal(summaries.get(campaign.metric_ids[1]).best_result.value, 0.45);
  assert.equal(summaries.get(latency.metric_id).best_result.value, 150);
  assert.equal(summaries.get(latency.metric_id).target_gap, 0);
  assert.equal(
    snapshot.summary.best_result.value,
    9.5,
    "Primary summary remains compatible",
  );
  console.log(
    "PASS: multiple metric observations, completed-run comparison, corrected/incompatible exclusion and range goals",
  );

  await denied(
    foreign.client,
    "publish_campaign",
    { ...scope, experiment_ids: [experiment.id], table_ids: [table.table_id] },
    403,
  );
  await denied(
    owner.client,
    "publish_campaign",
    { campaign_id: legacy.id, experiment_ids: [experiment.id] },
    404,
  );
  const humanOnly = await apiMutation(owner, "review_request", {
    ...scope,
    review_id: randomUUID(),
    decision: "approved",
  });
  assert.equal(
    humanOnly.response.status,
    403,
    "Agents must never approve human reviews",
  );
  const publicationKey = randomUUID();
  const published = await invoke(
    owner.client,
    "publish_campaign",
    { ...scope, experiment_ids: [experiment.id], table_ids: [table.table_id] },
    publicationKey,
  );
  assert.equal(published.visibility, "public");
  assert.deepEqual(
    await invoke(
      owner.client,
      "publish_campaign",
      { ...scope, experiment_ids: [experiment.id], table_ids: [table.table_id] },
      publicationKey,
    ),
    published,
  );
  const anonymous = await connectResearch(
    base,
    null,
    "rognet-multi-metric-public-test",
  );
  clients.push(anonymous);
  const publicTables = toolData(await anonymous.callTool({ name: "list_public_comparison_tables", arguments: scope }));
  assert.deepEqual(publicTables.tables.map((item) => item.id), [table.table_id]);
  assert(!publicTables.tables.some((item) => item.id === hidden.table_id));
  assert.deepEqual(publicTables.tables[0].rows, tableInput.rows);
  const page = await fetch(`${base}/campaigns/${campaign.id}`);
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  assert(pageHtml.includes("SYNTHETIC comparison"));
  assert(!pageHtml.includes("SYNTHETIC private table"));
  await denied(foreign.client, "remove_comparison_table", { ...scope, table_id: table.table_id }, 403);
  await denied(owner.client, "remove_comparison_table", { campaign_id: legacy.id, table_id: table.table_id }, 404);
  const removeTableKey = randomUUID();
  const removeTableInput = { ...scope, table_id: table.table_id };
  const removedTable = await invoke(owner.client, "remove_comparison_table", removeTableInput, removeTableKey);
  assert.equal(removedTable.was_published, true);
  assert.deepEqual(await invoke(owner.client, "remove_comparison_table", removeTableInput, removeTableKey), removedTable);
  const afterRemoval = toolData(await anonymous.callTool({ name: "list_public_comparison_tables", arguments: scope }));
  assert.equal(afterRemoval.tables.length, 0);
  const remainingTables = toolData(await owner.client.callTool({ name: "list_comparison_tables", arguments: scope }));
  assert.deepEqual(remainingTables.tables.map((item) => item.id), [hidden.table_id]);
  const publicCampaign = toolData(
    await anonymous.callTool({ name: "get_public_campaign", arguments: scope }),
  );
  assert(publicCampaign.items.some((item) => item.id === experiment.id));
  assert(
    !publicCampaign.items.some((item) => item.id === privateExperiment.id),
  );
  const publicExperiment = toolData(
    await anonymous.callTool({
      name: "get_public_experiment",
      arguments: { experiment_id: experiment.id },
    }),
  );
  assert.deepEqual(
    publicExperiment.experiment.metrics.map((metric) => metric.name).sort(),
    ["CSI", "Latency", "RMSE"].sort(),
  );
  console.log(
    "PASS: owner-agent selective public publication, idempotency, foreign/cross-campaign denial, unselected privacy and human-only review",
  );
} finally {
  await Promise.allSettled(clients.map((client) => client.close()));
}
