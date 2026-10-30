import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { connectResearch, runSyntheticScenario, toolData } from "./demo-research.mjs";

const base = process.argv[2] || "http://localhost:3000";
const origin = new URL(base).origin;
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname) && process.env.ALLOW_REMOTE_RESEARCH_TEST !== "1") throw new Error("Run this write-based integration suite against a disposable local database. Set ALLOW_REMOTE_RESEARCH_TEST=1 only for a dedicated remote test deployment.");
const password = randomBytes(24).toString("base64url");
async function account(label) {
  const response = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ name: `SYNTHETIC ${label}`, email: `rognet-${randomUUID()}@example.test`, password }) });
  const result = await response.json();
  assert.equal(response.status, 200, `Test account creation failed: ${JSON.stringify(result)}`);
  const cookies = response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  assert(cookies, "Sign-up did not create a session cookie");
  return { cookie: cookies, id: result.user.id };
}
async function humanJson(path, session, method = "GET", body) {
  const response = await fetch(`${base}${path}`, { method, headers: { Cookie: session.cookie, Origin: origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, data: await response.json() };
}
async function key(session, campaignId = null) {
  const { response, data } = await humanJson("/api/agent-keys", session, "POST", { name: "SYNTHETIC integration worker", campaign_id: campaignId });
  assert.equal(response.status, 201, JSON.stringify(data)); return data;
}
async function rejected(client, name, args, expectedStatus) {
  let result;
  try { result = await client.callTool({ name, arguments: args }); }
  catch (error) {
    const status = error.data?.status || error.status || error.statusCode || (error.name === "UnauthorizedError" ? 401 : error.name === "InsufficientScopeError" ? 403 : undefined);
    if (!status) throw error;
    if (expectedStatus) assert.equal(status, expectedStatus, `${name} must reject unauthorized transport requests`);
    return;
  }
  assert.equal(result.isError, true, `Expected ${name} to fail`);
  if (expectedStatus) assert.equal(JSON.parse(result.content.find(c => c.type === "text").text).status, expectedStatus);
}
async function snapshot(session, campaignId) {
  const { response, data } = await humanJson(`/api/research?campaign_id=${campaignId}`, session);
  assert.equal(response.status, 200, JSON.stringify(data)); return data;
}

const clients = [];
try {
  assert.equal((await fetch(`${base}/api/research`)).status, 401);
  const researcher = await account("Researcher");
  const inheritedAction = await humanJson("/api/research", researcher, "POST", { action: "toString", input: {}, idempotency_key: randomUUID() });
  assert.equal(inheritedAction.response.status, 400, "Inherited object properties are not valid research actions");
  const credential = await key(researcher);
  const client = await connectResearch(base, credential.token, "rognet-integration-test"); clients.push(client);
  const tools = await client.listTools();
  for (const name of ["create_campaign", "get_campaign", "list_campaigns", "get_research_context", "create_hypothesis", "list_hypotheses", "get_hypothesis", "propose_experiment", "start_experiment_run", "report_run_progress", "complete_experiment_run", "list_experiments", "get_experiment", "record_observation", "record_analysis", "record_scientific_decision", "propose_next_step", "request_human_review", "get_review_status", "record_artifact", "submit_reproduction", "search_public_campaigns", "get_public_campaign", "search_public_experiments", "get_public_experiment", "list_reproduction_reports", "get_reproduction_report", "search_solutions", "get_solution"]) assert(tools.tools.some(t => t.name === name), `Missing ${name}`);
  assert(!tools.tools.some(t => t.name === "review_request"), "Agent tool surface must not expose review approval");
  const resources = await client.listResources(); assert(resources.resources.some(r => r.uri === "rognet://research/workflow"));
  console.log("PASS: authenticated MCP v2 discovery, read-only workflow resource, unauthorized API denial");
  const scenario = await runSyntheticScenario(client);
  const scope = { campaign_id: scenario.campaign.id };
  const anonymous = await connectResearch(base, null, "rognet-public-registry-test"); clients.push(anonymous);
  const publicCampaigns = toolData(await anonymous.callTool({ name: "search_public_campaigns", arguments: { query: scenario.campaign.id } }));
  assert(Array.isArray(publicCampaigns.items));
  assert(!publicCampaigns.items.some(c => c.id === scenario.campaign.id));
  assert(Array.isArray(toolData(await anonymous.callTool({ name: "search_public_experiments", arguments: { query: scenario.campaign.id } })).items));
  assert(Array.isArray(toolData(await anonymous.callTool({ name: "search_solutions", arguments: { query: "synthetic" } })).items));
  await rejected(anonymous, "get_public_campaign", scope, 404);
  await rejected(anonymous, "get_public_experiment", { experiment_id: scenario.experiments[0].id }, 404);
  await rejected(anonymous, "get_campaign", scope, 401);
  console.log("PASS: single-connection anonymous public searches with private campaign/experiment isolation");
  const data = await snapshot(researcher, scenario.campaign.id);
  assert.equal(data.experiments.length, 2); assert.equal(data.runs.length, 2);
  assert.equal(data.observations.length, 2); assert.equal(data.analyses.length, 2);
  assert.equal(data.hypotheses.length, 3);
  assert(data.hypotheses.some(h => h.parent_hypothesis_id === scenario.hypotheses[0].id && h.relationship === "alternative_to"));
  assert(data.decisions.some(d => d.outcome === "inconclusive")); assert(data.decisions.some(d => d.outcome === "contradicted"));
  assert(Math.abs(data.summary.progress_percent - 20) < 0.0001);
  assert.equal(data.summary.best_verified_result, null, "Unreproduced results must not be labeled independently verified");
  assert(data.events.every((e, i) => i === 0 || e.id > data.events[i - 1].id));
  assert(data.events.some(e => e.event_type === "record_analysis"));
  assert(!data.observations.some(o => "interpretation" in o), "Measurements and analyses must be separate");
  console.log("PASS: complete real MCP lifecycle, branching hypotheses, negative/inconclusive evidence, progress math, ordered persisted audit events");
  const duplicateKey = randomUUID();
  const args = { ...scope, title: "SYNTHETIC · Retry-safe hypothesis", statement: "A retried write creates exactly one scientific record.", rationale: "Network retries must not duplicate research.", prediction: "Identical idempotency keys return stable IDs.", idempotency_key: duplicateKey };
  const first = toolData(await client.callTool({ name: "create_hypothesis", arguments: args }));
  const second = toolData(await client.callTool({ name: "create_hypothesis", arguments: args }));
  assert.equal(first.id, second.id); assert.equal(first.event_id, second.event_id);
  await rejected(client, "create_hypothesis", { ...args, title: "Different payload with reused key" }, 409);
  const afterRetry = await snapshot(researcher, scenario.campaign.id);
  assert.equal(afterRetry.hypotheses.filter(h => h.id === first.id).length, 1);
  assert.equal(afterRetry.events.filter(e => e.entity_id === first.id).length, 1);
  await rejected(client, "report_run_progress", { ...scope, run_id: scenario.runs[0].id, progress: 100, task: "Cannot update a completed run", idempotency_key: randomUUID() }, 409);
  await rejected(client, "complete_experiment_run", { ...scope, run_id: scenario.runs[0].id, status: "completed", summary: "Invalid second completion", idempotency_key: randomUUID() }, 409);
  console.log("PASS: stable idempotent results, conflicting retries and invalid terminal run transitions rejected");
  const measured = toolData(await client.callTool({ name: "record_observation", arguments: { ...scope, run_id: scenario.runs[0].id, metric_id: scenario.campaign.metric_id, value: 99, unit: "dB", qualitative: "SYNTHETIC incompatible fixture", evidence: "Synthetic incompatible dataset: this result must never enter baseline comparisons.", conditions_key: "Different dataset and metric evaluation protocol", idempotency_key: randomUUID() } }));
  assert(measured.id);
  const incompatible = await snapshot(researcher, scenario.campaign.id);
  assert.equal(incompatible.summary.best_result.value, 28.4);
  assert.equal(incompatible.summary.incomparable_observations, 1);
  await rejected(client, "record_observation", { ...scope, run_id: scenario.runs[0].id, metric_id: scenario.campaign.metric_id, value: 29, unit: "m/s", evidence: "Incorrect unit fixture", conditions_key: scenario.protocol, idempotency_key: randomUUID() }, 400);
  console.log("PASS: incompatible conditions excluded from comparison and mismatched units rejected");
  const reviewId = scenario.review.id;
  const agentApproval = await fetch(`${base}/api/research`, { method: "POST", headers: { Authorization: `Bearer ${credential.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "review_request", input: { ...scope, review_id: reviewId, decision: "approved" }, idempotency_key: randomUUID() }) });
  assert.equal(agentApproval.status, 403);
  const attacker = await account("Unrelated researcher");
  assert.equal((await humanJson(`/api/research?campaign_id=${scenario.campaign.id}`, attacker)).response.status, 403);
  const unauthorizedApproval = await humanJson("/api/research", attacker, "POST", { action: "review_request", input: { ...scope, review_id: reviewId, decision: "approved" }, idempotency_key: randomUUID() });
  assert.equal(unauthorizedApproval.response.status, 403);
  const approved = await humanJson("/api/research", researcher, "POST", { action: "review_request", input: { ...scope, review_id: reviewId, decision: "approved", feedback: "SYNTHETIC integration test: approve the next step." }, idempotency_key: randomUUID() });
  assert.equal(approved.response.status, 200, JSON.stringify(approved.data));
  const reviewStatus = toolData(await client.callTool({ name: "get_review_status", arguments: { ...scope, review_id: reviewId } }));
  assert.equal(reviewStatus.review.status, "approved");
  assert.equal(reviewStatus.review.reviewed_by, researcher.id);
  const gated = toolData(await client.callTool({ name: "propose_experiment", arguments: { ...scope, hypothesis_id: scenario.hypotheses[0].id, title: "SYNTHETIC · Approval-gated design", method: "Synthetic test of human supervision", inputs: "Synthetic fixture", conditions: scenario.protocol, success_criteria: "Must await authorized researcher approval", requires_approval: true, idempotency_key: randomUUID() } }));
  await rejected(client, "start_experiment_run", { ...scope, experiment_id: gated.id, idempotency_key: randomUUID() }, 409);
  console.log("PASS: agent and unrelated researcher approval denied; authorized human approval recorded; gated execution blocked");
  const scopedKey = await key(researcher, scenario.campaign.id);
  const scoped = await connectResearch(base, scopedKey.token, "rognet-scoped-test"); clients.push(scoped);
  await rejected(scoped, "get_campaign", { campaign_id: randomUUID() }, 403);
  await rejected(scoped, "create_campaign", { title: "SYNTHETIC scope denial", question: "Can a scoped worker escape its campaign?", summary: "This campaign creation must be rejected.", objective: "Exercise campaign-scoped access", metric: { name: "Score", direction: "maximize", target: 1, evaluation_protocol: "Synthetic fixture" }, idempotency_key: randomUUID() }, 403);
  const beforeLive = await snapshot(researcher, scenario.campaign.id);
  const cursor = beforeLive.events.at(-1).id;
  const abort = new AbortController();
  const live = await fetch(`${base}/api/research/events?campaign_id=${scenario.campaign.id}&after=${cursor}`, { headers: { Cookie: researcher.cookie }, signal: abort.signal });
  assert.equal(live.status, 200); assert(live.headers.get("content-type").includes("text/event-stream"));
  const reader = live.body.getReader(); const decoder = new TextDecoder();
  await reader.read();
  const liveWrite = toolData(await client.callTool({ name: "propose_next_step", arguments: { ...scope, proposed_action: "SYNTHETIC live stream test", rationale: "Prove that a persisted MCP mutation reaches the dashboard event stream.", requires_approval: false, idempotency_key: randomUUID() } }));
  let text = "";
  const deadline = setTimeout(() => abort.abort(), 12000);
  try {
    while (!text.includes(`id: ${liveWrite.event_id}\n`)) {
      const chunk = await reader.read(); if (chunk.done) break; text += decoder.decode(chunk.value, { stream: true });
    }
    assert(text.includes(`id: ${liveWrite.event_id}\n`)); assert(text.includes("event: research"));
  } finally { clearTimeout(deadline); abort.abort(); }
  const revoked = await humanJson("/api/agent-keys", researcher, "DELETE", { id: scopedKey.key.id }); assert.equal(revoked.response.status, 200);
  await rejected(scoped, "get_campaign", scope, 401);
  const reconnected = await connectResearch(base, credential.token, "rognet-persistence-test"); clients.push(reconnected);
  const recovered = toolData(await reconnected.callTool({ name: "get_campaign", arguments: scope })); assert.equal(recovered.campaign.id, scenario.campaign.id);
  console.log("PASS: campaign-scoped credentials, credential revocation, live SSE delivery and fresh-client persistence");
  const agentPublish = await fetch(`${base}/api/research`, { method: "POST", headers: { Authorization: `Bearer ${credential.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish_campaign", input: { ...scope, experiment_ids: [scenario.experiments[0].id] }, idempotency_key: randomUUID() }) });
  assert.equal(agentPublish.status, 403);
  const publication = await humanJson("/api/research", researcher, "POST", { action: "publish_campaign", input: { ...scope, experiment_ids: [scenario.experiments[0].id] }, idempotency_key: randomUUID() });
  assert.equal(publication.response.status, 200, JSON.stringify(publication.data));
  const publicView = toolData(await anonymous.callTool({ name: "get_public_campaign", arguments: scope }));
  assert(publicView.items.some(e => e.id === scenario.experiments[0].id));
  assert(!publicView.items.some(e => e.id === scenario.experiments[1].id), "Unselected private experiment must stay private");
  const reproKey = await key(attacker);
  const reproducer = await connectResearch(base, reproKey.token, "rognet-reproducer-test"); clients.push(reproducer);
  const source = toolData(await reproducer.callTool({ name: "create_campaign", arguments: { title: "SYNTHETIC · Independent reproduction campaign", question: "Does an independent account observe the same synthetic fixture result?", summary: "Synthetic integration fixture; no real scientific reproduction occurred.", objective: "Exercise cumulative reproduction reports and shared knowledge access", metric: { name: "Fixture agreement", unit: "", direction: "maximize", baseline: 0, target: 1, evaluation_protocol: "Synthetic fixture reproduction-v1" }, idempotency_key: randomUUID() } }));
  const reproduction = { campaign_id: source.id, target_experiment_id: scenario.experiments[0].id, result: "reproduced", observations: "SYNTHETIC independent-account fixture agrees with the registered observation; no real workload executed.", evidence: "SYNTHETIC test fixture evidence emitted by scripts/test-research.mjs; not empirical verification.", conditions: scenario.protocol, differences: "Separate synthetic account and service credential; institutional independence is unverified." };
  const privateReport = toolData(await reproducer.callTool({ name: "submit_reproduction", arguments: { ...reproduction, idempotency_key: randomUUID() } }));
  assert.equal(privateReport.visibility, "private"); assert(!("access_token" in privateReport));
  const hidden = toolData(await anonymous.callTool({ name: "list_reproduction_reports", arguments: { experiment_id: scenario.experiments[0].id } })); assert.equal(hidden.items.length, 0);
  const publishedReport = toolData(await reproducer.callTool({ name: "submit_reproduction", arguments: { ...reproduction, visibility: "public", idempotency_key: randomUUID() } }));
  assert.equal(publishedReport.visibility, "public");
  const secondCredential = await key(attacker);
  const secondWorker = await connectResearch(base, secondCredential.token, "rognet-same-account-reproduction-test"); clients.push(secondWorker);
  toolData(await secondWorker.callTool({ name: "submit_reproduction", arguments: { ...reproduction, visibility: "public", evidence: "SYNTHETIC second report from another key of the same account. It must count as one contributor identity.", idempotency_key: randomUUID() } }));
  const reproduced = toolData(await anonymous.callTool({ name: "get_public_experiment", arguments: { experiment_id: scenario.experiments[0].id } }));
  assert.equal(reproduced.experiment.reproducing_agent_count, 1, "Multiple keys of one account must not count as multiple independent contributors");
  assert.equal(reproduced.experiment.reproduced_count, 2);
  await rejected(client, "submit_reproduction", { ...reproduction, ...scope, idempotency_key: randomUUID() }, 403);
  const visibleReports = toolData(await anonymous.callTool({ name: "list_reproduction_reports", arguments: { experiment_id: scenario.experiments[0].id } })); assert.equal(visibleReports.items.length, 2);
  const exactReport = toolData(await anonymous.callTool({ name: "get_reproduction_report", arguments: { report_id: publishedReport.id } })); assert.equal(JSON.parse(exactReport.content).result, "reproduced");
  console.log("PASS: human-only selective publication, private reproduction isolation, independent-account reports, stable contributor counts across keys, and own-campaign reproduction denial");
  const foreignOrigin = await fetch(`${base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://untrusted.invalid" }, body: "{}" }); assert.equal(foreignOrigin.status, 403);
  const tooLarge = await fetch(`${base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ padding: "x".repeat(100001) }) }); assert.equal(tooLarge.status, 413);
  console.log("PASS: MCP Origin protection and bounded request bodies");
  console.log(`Synthetic test campaign: ${base}/observatory?campaign=${scenario.campaign.id}`);
} finally { await Promise.allSettled(clients.map(c => c.close())); }
