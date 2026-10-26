import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { neon } from "@neondatabase/serverless";
const base = process.argv[2] || "http://localhost:3000";
if (!process.env.DATABASE_URL)
  throw new Error(
    "Use --env-file=.env.local with a database you own for fixture cleanup.",
  );
const sql = neon(process.env.DATABASE_URL),
  ids = [];
const client = new Client({
  name: "fixrelay-lifecycle-test",
  version: "0.2.0",
});
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", base)));
const call = (name, args) => client.callTool({ name, arguments: args });
const data = (r) => {
  assert(!r.isError, JSON.stringify(r));
  return JSON.parse(r.content[0].text);
};
const token = randomBytes(32).toString("base64url"),
  wrong = randomBytes(32).toString("base64url"),
  marker = randomUUID();
const plan = {
  title: `Registry integration fixture ${marker}`,
  question: `Does this private registry fixture remain isolated from public queries? ${marker}`,
  hypothesis: "A private record is only accessible with its owning capability.",
  method:
    "Use the official SDK to register, query, start, complete, retry and publish an isolated test record. These are software integration fixtures, not scientific findings.",
  inputs: "Generated fixture ID and two independent random access tokens.",
  conditions:
    "FixRelay integration test against the explicitly selected deployment.",
  success_criteria:
    "Private reads and writes fail without the correct token, lifecycle updates persist, and cleanup succeeds.",
  tags: ["integration-test"],
  agent: "FixRelay test runner",
  access_token: token,
};
try {
  const initial = data(await call("register_experiment", plan));
  ids.push(initial.id);
  assert.equal(initial.visibility, "private");
  const duplicate = data(await call("register_experiment", plan));
  assert.equal(duplicate.id, initial.id);
  assert.equal(duplicate.duplicate, true);
  assert.equal(
    (await call("get_experiment", { id: initial.id })).isError,
    true,
  );
  assert.equal(
    (await call("get_experiment", { id: initial.id, access_token: wrong }))
      .isError,
    true,
  );
  assert(
    !data(await call("search_experiments", { query: marker })).experiments.some(
      (r) => r.id === initial.id,
    ),
  );
  const owned = data(
    await call("search_experiments", {
      query: marker,
      access_token: token,
      scope: "owned",
    }),
  );
  assert.equal(owned.experiments.length, 1);
  const record = data(
    await call("get_experiment", { id: initial.id, access_token: token }),
  );
  assert.equal(record.status, "planned");
  for (const field of [
    "owner_hash",
    "fingerprint",
    "outcome_hash",
    "access_token",
  ])
    assert(!(field in record));
  assert.equal((await fetch(`${base}/experiments/${initial.id}`)).status, 404);
  const privateRes = await fetch(`${base}/api/experiments/private`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: token, query: marker }),
  });
  assert.equal(privateRes.headers.get("cache-control"), "no-store");
  assert(
    (await privateRes.json()).experiments.some((r) => r.id === initial.id),
  );
  assert.equal(
    (await call("start_experiment", { id: initial.id, access_token: wrong }))
      .isError,
    true,
  );
  data(await call("start_experiment", { id: initial.id, access_token: token }));
  assert.equal(
    data(await call("get_experiment", { id: initial.id, access_token: token }))
      .status,
    "running",
  );
  console.log(
    "PASS: private registration, deduplication, search isolation, token enforcement and running state",
  );
  const result = {
    id: initial.id,
    access_token: token,
    outcome: "supported",
    observations:
      "The registered fixture was absent from public search and unavailable without its token. The correct token returned its plan and allowed the running transition.",
    evidence:
      "Official SDK assertions checked public search exclusion, private reads, wrong-token rejection, private page HTTP 404, no-store headers and the running state.",
    limitations:
      "This is a software integration fixture; it does not constitute a scientific experiment or an independent audit.",
    metrics: [{ name: "integration fixture", value: 1, unit: "record" }],
  };
  const concurrent = await Promise.all([
    call("record_outcome", result),
    call("record_outcome", result),
  ]);
  concurrent.forEach(data);
  assert.equal(data(await call("record_outcome", result)).duplicate, true);
  assert.equal(
    (await call("record_outcome", { ...result, outcome: "not_supported" }))
      .isError,
    true,
  );
  assert.equal(
    (await call("start_experiment", { id: initial.id, access_token: token }))
      .isError,
    true,
  );
  const done = data(
    await call("get_experiment", { id: initial.id, access_token: token }),
  );
  assert.equal(done.status, "completed");
  assert.equal(done.outcome, "supported");
  assert.equal(done.metrics[0].value, 1);
  assert(done.started_at && done.completed_at);
  console.log(
    "PASS: concurrent identical outcomes, immutability, metrics and lifecycle timestamps",
  );
  const badReplica = await call("register_experiment", {
    ...plan,
    title: "Missing replication explanation",
    replication_of: initial.id,
  });
  assert.equal(badReplica.isError, true);
  assert.equal(
    (await call("publish_experiment", { id: initial.id, access_token: wrong }))
      .isError,
    true,
  );
  data(
    await call("publish_experiment", { id: initial.id, access_token: token }),
  );
  assert.equal(
    data(await call("get_experiment", { id: initial.id })).visibility,
    "public",
  );
  assert(
    data(
      await call("search_experiments", {
        query: marker,
        status: "completed",
        outcome: "supported",
      }),
    ).experiments.some((r) => r.id === initial.id),
  );
  const page = await fetch(`${base}/experiments/${initial.id}`);
  assert.equal(page.status, 200);
  assert((await page.text()).includes(plan.title));
  const replica = data(
    await call("register_experiment", {
      ...plan,
      title: `Replication fixture ${marker}`,
      replication_of: initial.id,
      replication_reason:
        "Verify that intentional replication is a separate linked attempt.",
      visibility: "public",
    }),
  );
  ids.push(replica.id);
  assert.equal(
    data(await call("get_experiment", { id: replica.id })).replication_of,
    initial.id,
  );
  const report = {
    experiment_id: initial.id,
    reproduction_id: replica.id,
    access_token: token,
    result: "not_reproduced",
    observations:
      "Integration fixture: this simulated reproduction verdict checks annotation logic, not a scientific finding.",
    evidence:
      "The completed fixture has an explicitly stored outcome; test assertions verify original-record annotations.",
    differences:
      "Synthetic software test fixtures; no scientific interpretation is intended.",
  };
  assert.equal((await call("submit_reproduction", report)).isError, true);
  data(
    await call("record_outcome", {
      ...result,
      id: replica.id,
      outcome: "not_supported",
    }),
  );
  assert.equal(
    (await call("submit_reproduction", { ...report, access_token: wrong }))
      .isError,
    true,
  );
  data(await call("submit_reproduction", report));
  assert.equal(data(await call("submit_reproduction", report)).duplicate, true);
  assert.equal(
    (await call("submit_reproduction", { ...report, result: "reproduced" }))
      .isError,
    true,
  );
  const annotated = data(await call("get_experiment", { id: initial.id }));
  assert.equal(annotated.reproduction_status, "not_reproduced");
  assert.equal(annotated.outcome, "supported");
  assert.equal(annotated.not_reproduced_count, 1);
  assert.equal(
    data(await call("search_experiments", { query: marker })).experiments.find(
      (r) => r.id === initial.id,
    ).reproduction_status,
    "not_reproduced",
  );
  const second = data(
    await call("register_experiment", {
      ...plan,
      title: `Second replication ${marker}`,
      replication_of: initial.id,
      replication_reason:
        "Test private reproduction evidence isolation and mixed public summaries.",
    }),
  );
  ids.push(second.id);
  data(await call("record_outcome", { ...result, id: second.id }));
  data(
    await call("submit_reproduction", {
      ...report,
      reproduction_id: second.id,
      result: "reproduced",
    }),
  );
  assert.equal(
    data(await call("get_experiment", { id: initial.id })).reproduction_status,
    "not_reproduced",
  );
  assert.equal(
    data(await call("get_experiment", { id: initial.id, access_token: token }))
      .reproduction_status,
    "mixed",
  );
  data(
    await call("publish_experiment", { id: second.id, access_token: token }),
  );
  assert.equal(
    data(await call("get_experiment", { id: initial.id })).reproduction_status,
    "mixed",
  );
  assert(
    (await (await fetch(`${base}/experiments/${initial.id}`)).text()).includes(
      "Mixed reproduction reports",
    ),
  );
  console.log(
    "PASS: reproduction ownership, completion requirement, failed-reproduction annotations, private evidence isolation and mixed findings",
  );
  console.log(
    "PASS: owner-controlled publication, outcome/status filters, rendered detail and replication links",
  );
  for (const outcome of [
    "not_supported",
    "inconclusive",
    "technical_failure",
    "cancelled",
  ]) {
    const r = data(
      await call("register_experiment", {
        ...plan,
        title: `Outcome ${outcome} fixture ${marker}`,
      }),
    );
    ids.push(r.id);
    data(await call("record_outcome", { ...result, id: r.id, outcome }));
    const record = data(
      await call("get_experiment", { id: r.id, access_token: token }),
    );
    assert.equal(record.outcome, outcome);
    assert.equal(
      record.status,
      outcome === "cancelled" ? "cancelled" : "completed",
    );
  }
  console.log(
    "PASS: negative, inconclusive, technical failure and cancellation outcomes",
  );
} finally {
  await client.close();
  // Only delete exact IDs created by this test, child before parent. Never touch other records.
  for (const id of ids)
    await sql`DELETE FROM reproduction_reports WHERE reproduction_id=${id}`;
  for (const id of [...ids].reverse())
    await sql`DELETE FROM experiments WHERE id=${id}`;
  console.log(`Cleaned up ${ids.length} integration fixture records.`);
}
