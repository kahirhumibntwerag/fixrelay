import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { connectResearch, toolData } from "./demo-research.mjs";

const base = new URL(process.argv[2] || "http://localhost:3001").origin;
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname),
  "Chart write tests require a disposable local database",
);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA34AAAAASUVORK5CYII=",
  "base64",
);
const marker = randomUUID();
// Genuine 2×2 white image fixtures, generated once with sharp and embedded
// here so dimension-header regressions need no image library at runtime.
const jpeg = Buffer.from(
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z",
  "base64",
);
const webp = Buffer.from(
  "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAUAmJaQAA3AA/vz0AAA=",
  "base64",
);
const webpLossless = Buffer.from(
  "UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAfQ//73v/+BiOh/AAA=",
  "base64",
);
const webpExtended = Buffer.from(
  "UklGRkQAAABXRUJQVlA4WAoAAAAQAAAAAQAAAQAAQUxQSAUAAAAAgICAgABWUDggGAAAADABAJ0BKgIAAgABQCYlpAADcAD+/PQAAA==",
  "base64",
);
async function account(label) {
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      name: `SYNTHETIC chart ${label}`,
      email: `chart-${randomUUID()}@example.test`,
      password: randomBytes(24).toString("base64url"),
    }),
  });
  assert.equal(response.status, 200, "Disposable chart test signup failed");
  return {
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  };
}
async function json(path, session, method = "GET", body, bearer) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(session ? { Cookie: session.cookie } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      Origin: base,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, data: await response.json() };
}
async function mutate(session, action, input, bearer) {
  return json(
    "/api/research",
    session,
    "POST",
    { action, input, idempotency_key: randomUUID() },
    bearer,
  );
}
async function campaign(session, title) {
  const result = await mutate(session, "create_campaign", {
    title: `SYNTHETIC ${title} ${marker}`,
    question:
      "Can a chart upload remain private until explicitly selected for public publication?",
    summary:
      "Synthetic chart privacy integration fixture, not a scientific finding.",
    objective:
      "Verify chart storage, authentication, idempotency and publication isolation.",
    metric: {
      name: "Synthetic value",
      direction: "maximize",
      target: 1,
      evaluation_protocol: "Synthetic chart privacy fixture",
    },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  return result.data;
}
async function upload(session, campaignId, options = {}) {
  const form = new FormData();
  form.set("campaign_id", campaignId);
  form.set("title", options.title || "SYNTHETIC chart");
  form.set(
    "caption",
    options.caption ||
      "Synthetic 1×1 image for upload and privacy verification.",
  );
  form.set("idempotency_key", options.key || randomUUID());
  if (options.metric_id) form.set("metric_id", options.metric_id);
  if (options.experiment_id) form.set("experiment_id", options.experiment_id);
  form.set(
    "file",
    new File([options.bytes || png], "test.png", {
      type: options.mime || "image/png",
    }),
  );
  const response = await fetch(`${base}/api/research/charts`, {
    method: "POST",
    headers: {
      ...(session ? { Cookie: session.cookie } : {}),
      ...(options.bearer ? { Authorization: `Bearer ${options.bearer}` } : {}),
      ...(options.omitOrigin ? {} : { Origin: base }),
    },
    body: form,
  });
  return { response, data: await response.json() };
}
async function rejectedTool(client, name, args, status) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, true, `${name} should fail`);
  assert.equal(toolError(result).status, status);
}
function toolError(result) {
  return (
    result.structuredContent ||
    JSON.parse(result.content.find((item) => item.type === "text").text)
  );
}
const clients = [];
try {
  const owner = await account("owner"),
    outsider = await account("outsider");
  const a = await campaign(owner, "chart campaign A"),
    b = await campaign(outsider, "chart campaign B");
  const key = randomUUID();
  const caption = "SYNTHETIC chart privacy verification. ".repeat(30).trim();
  const first = await upload(owner, a.id, {
    key,
    metric_id: a.metric_id,
    caption,
  });
  assert.equal(first.response.status, 201, JSON.stringify(first.data));
  const chart = first.data.chart;
  assert.equal(chart.mime_type, "image/png");
  assert.equal(chart.sha256, createHash("sha256").update(png).digest("hex"));
  assert.equal(chart.is_public, false);
  assert.equal(chart.byte_size, png.length);
  assert(!("image" in chart), "Metadata must not contain binary image bytes");
  const retry = await upload(owner, a.id, {
    key,
    metric_id: a.metric_id,
    caption,
  });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.data.chart.id, chart.id);
  assert.equal(
    (
      await upload(owner, a.id, {
        key,
        title: "Different title",
        metric_id: a.metric_id,
      })
    ).response.status,
    409,
  );
  assert.equal((await upload(outsider, a.id)).response.status, 403);
  assert.equal(
    (await upload(owner, a.id, { metric_id: b.metric_id })).response.status,
    404,
  );
  assert.equal(
    (await upload(owner, a.id, { omitOrigin: true })).response.status,
    403,
  );
  assert.equal(
    (await upload(owner, a.id, { mime: "image/jpeg" })).response.status,
    400,
  );
  assert.equal(
    (
      await upload(owner, a.id, {
        bytes: Buffer.from("<svg><script>alert(1)</script></svg>"),
      })
    ).response.status,
    400,
  );
  assert.equal(
    (await upload(owner, a.id, { bytes: Buffer.alloc(2 * 1024 * 1024 + 1) }))
      .response.status,
    413,
  );
  const privateImage = await fetch(`${base}${chart.url}`);
  assert.equal(privateImage.status, 401);
  const memberImage = await fetch(`${base}${chart.url}`, {
    headers: { Cookie: owner.cookie },
  });
  assert.equal(memberImage.status, 200);
  assert.equal(memberImage.headers.get("content-type"), "image/png");
  assert.equal(memberImage.headers.get("x-content-type-options"), "nosniff");
  assert.match(memberImage.headers.get("content-security-policy"), /sandbox/);
  assert.deepEqual(Buffer.from(await memberImage.arrayBuffer()), png);
  assert.equal(
    (await json(`/api/research/charts?campaign_id=${a.id}`, outsider)).response
      .status,
    403,
  );
  assert.equal(
    (await json(`/api/research/charts?campaign_id=${a.id}&public=true`)).data
      .charts.length,
    0,
  );
  console.log(
    "PASS: image signature/type/size validation, private bytes, membership, CSRF, exact image hash and idempotency",
  );

  const agentKey = await json("/api/agent-keys", owner, "POST", {
    name: "SYNTHETIC chart worker",
    campaign_id: null,
  });
  assert.equal(agentKey.response.status, 201);
  const agent = await connectResearch(
    base,
    agentKey.data.token,
    "synthetic-chart-test",
  );
  clients.push(agent);
  const anonymous = await connectResearch(
    base,
    null,
    "synthetic-public-chart-test",
  );
  clients.push(anonymous);
  assert.equal(
    toolData(
      await anonymous.callTool({
        name: "list_public_charts",
        arguments: { campaign_id: a.id },
      }),
    ).charts.length,
    0,
  );
  // A valid PNG followed by inert padding exercises the image-only MCP body
  // budget above the ordinary 100 kB limit without requiring a plotting library.
  const transportFixture = Buffer.concat([png, Buffer.alloc(130000)]);
  const agentChart = toolData(
    await agent.callTool({
      name: "upload_chart",
      arguments: {
        campaign_id: a.id,
        title: "SYNTHETIC MCP chart",
        mime_type: "image/png",
        content_base64: transportFixture.toString("base64"),
        idempotency_key: randomUUID(),
      },
    }),
  ).chart;
  assert(agentChart.id);
  assert.equal(
    new URL(agentChart.url).origin,
    base,
    "MCP chart image URLs should be canonical absolute URLs",
  );
  const listed = toolData(
    await agent.callTool({
      name: "list_charts",
      arguments: { campaign_id: a.id },
    }),
  );
  assert.equal(listed.charts.length, 2);
  for (const [bytes, mime] of [
    [jpeg, "image/jpeg"],
    [webp, "image/webp"],
    [webpLossless, "image/webp"],
    [webpExtended, "image/webp"],
  ]) {
    const accepted = await upload(owner, a.id, { bytes, mime });
    assert.equal(
      accepted.response.status,
      201,
      `${mime} valid fixture: ${JSON.stringify(accepted.data)}`,
    );
  }
  const hugePng = Buffer.from(png);
  hugePng.writeUInt32BE(20000, 16);
  const hugeJpeg = Buffer.from(jpeg),
    sof = hugeJpeg.indexOf(Buffer.from([0xff, 0xc0]));
  assert(sof >= 0);
  hugeJpeg.writeUInt16BE(20000, sof + 7);
  const hugeJpegArea = Buffer.from(jpeg);
  hugeJpegArea.writeUInt16BE(10000, sof + 7);
  hugeJpegArea.writeUInt16BE(10000, sof + 5);
  const hugeVp8 = Buffer.from(webp);
  hugeVp8.writeUInt16LE(10000, 26);
  hugeVp8.writeUInt16LE(10000, 28);
  const hugeVp8l = Buffer.from(webpLossless);
  hugeVp8l.writeUInt32LE(9999 | (9999 << 14), 21);
  const hugeVp8x = Buffer.from(webpExtended);
  hugeVp8x.writeUIntLE(19999, 24, 3);
  for (const [bytes, mime] of [
    [hugePng, "image/png"],
    [hugeJpeg, "image/jpeg"],
    [hugeJpegArea, "image/jpeg"],
    [hugeVp8, "image/webp"],
    [hugeVp8l, "image/webp"],
    [hugeVp8x, "image/webp"],
  ]) {
    const denied = await upload(owner, a.id, { bytes, mime });
    assert.equal(denied.response.status, 400);
    assert.match(denied.data.error, /dimensions are too large/);
  }
  const truncatedWebp = webpExtended.subarray(0, 26);
  truncatedWebp.writeUInt32LE(truncatedWebp.length - 8, 4);
  assert.equal(
    (await upload(owner, a.id, { bytes: truncatedWebp, mime: "image/webp" }))
      .response.status,
    400,
  );
  assert.equal(
    (
      await upload(owner, a.id, {
        bytes: Buffer.from([
          0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 1, 0xff, 0xd9,
        ]),
        mime: "image/jpeg",
      })
    ).response.status,
    400,
  );
  console.log(
    "PASS: real JPEG, VP8, VP8L and VP8X fixtures; all format dimension/area limits and truncated-header rejection",
  );
  await rejectedTool(
    agent,
    "upload_chart",
    {
      campaign_id: a.id,
      title: "SYNTHETIC bad image",
      mime_type: "image/png",
      content_base64: "AAAA",
      idempotency_key: randomUUID(),
    },
    400,
  );
  const scope = { campaign_id: a.id };
  const hypothesis = toolData(
    await agent.callTool({
      name: "create_hypothesis",
      arguments: {
        ...scope,
        title: "SYNTHETIC publishing hypothesis",
        statement: "This synthetic chart can be selectively published.",
        rationale: "Publication privacy is under integration test.",
        prediction: "Unselected charts remain private.",
        idempotency_key: randomUUID(),
      },
    }),
  );
  const experiment = toolData(
    await agent.callTool({
      name: "propose_experiment",
      arguments: {
        ...scope,
        hypothesis_id: hypothesis.id,
        title: "SYNTHETIC publishing experiment",
        method: "Record a disposable test fixture.",
        inputs: "Synthetic image",
        conditions: "Synthetic chart privacy fixture",
        success_criteria: "Selected charts alone become public.",
        idempotency_key: randomUUID(),
      },
    }),
  );
  const run = toolData(
    await agent.callTool({
      name: "start_experiment_run",
      arguments: {
        ...scope,
        experiment_id: experiment.id,
        task: "Synthetic test fixture only",
        idempotency_key: randomUUID(),
      },
    }),
  );
  toolData(
    await agent.callTool({
      name: "complete_experiment_run",
      arguments: {
        ...scope,
        run_id: run.id,
        status: "completed",
        outcome: "inconclusive",
        summary: "Synthetic integration fixture; no scientific claim.",
        idempotency_key: randomUUID(),
      },
    }),
  );
  toolData(
    await agent.callTool({
      name: "publish_campaign",
      arguments: {
        ...scope,
        experiment_ids: [experiment.id],
        idempotency_key: randomUUID(),
      },
    }),
  );
  assert.equal(
    (await json(`/api/research/charts?campaign_id=${a.id}&public=true`)).data
      .charts.length,
    0,
    "Publishing a campaign must not silently publish charts",
  );
  assert.equal((await fetch(`${base}${chart.url}`)).status, 401);
  toolData(
    await agent.callTool({
      name: "publish_campaign",
      arguments: {
        ...scope,
        experiment_ids: [],
        chart_ids: [chart.id],
        idempotency_key: randomUUID(),
      },
    }),
  );
  const publicCharts = (
    await json(`/api/research/charts?campaign_id=${a.id}&public=true`)
  ).data.charts;
  assert.deepEqual(
    publicCharts.map((item) => item.id),
    [chart.id],
  );
  assert.equal((await fetch(`${base}${chart.url}`)).status, 200);
  assert.equal(
    (await fetch(agentChart.url)).status,
    401,
    "Unselected chart bytes must remain private",
  );
  const publicToolCharts = toolData(
    await anonymous.callTool({
      name: "list_public_charts",
      arguments: { campaign_id: a.id },
    }),
  );
  assert.deepEqual(
    publicToolCharts.charts.map((item) => item.id),
    [chart.id],
  );
  assert(publicToolCharts.charts[0].caption.length <= 241);
  assert.equal(publicToolCharts.charts[0].caption_truncated, true);
  assert.equal(new URL(publicToolCharts.charts[0].url).origin, base);
  const later = await upload(owner, a.id);
  assert.equal(later.response.status, 201);
  assert.equal(
    later.data.chart.is_public,
    false,
    "New chart uploads remain private even after campaign publication",
  );
  const privateExperiment = toolData(
    await agent.callTool({
      name: "propose_experiment",
      arguments: {
        ...scope,
        hypothesis_id: hypothesis.id,
        title: "SYNTHETIC private linked experiment",
        method: "Private planned experiment fixture.",
        inputs: "Synthetic image",
        conditions: "Synthetic chart privacy fixture",
        success_criteria:
          "Private experiment charts cannot leak through campaign publication.",
        idempotency_key: randomUUID(),
      },
    }),
  );
  const linked = await upload(owner, a.id, {
    experiment_id: privateExperiment.id,
  });
  assert.equal(linked.response.status, 201);
  await rejectedTool(
    agent,
    "publish_campaign",
    {
      ...scope,
      experiment_ids: [],
      chart_ids: [linked.data.chart.id],
      idempotency_key: randomUUID(),
    },
    400,
  );
  assert.equal((await fetch(`${base}${linked.data.chart.url}`)).status, 401);
  const foreign = await upload(outsider, b.id);
  await rejectedTool(
    agent,
    "publish_campaign",
    {
      ...scope,
      experiment_ids: [],
      chart_ids: [foreign.data.chart.id],
      idempotency_key: randomUUID(),
    },
    404,
  );
  console.log(
    "PASS: MCP upload/list, owner-agent publication, explicit selected chart publication and private-by-default later uploads",
  );
} finally {
  await Promise.all(clients.map((client) => client.close()));
}
