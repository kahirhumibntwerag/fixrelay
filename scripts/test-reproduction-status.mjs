import assert from "node:assert/strict";
import { campaignEvidence } from "../src/lib/reproduction-status.ts";
const done = { status: "completed" },
  yes = { ...done, reproduced_count: 1 },
  no = { ...done, not_reproduced_count: 1 },
  blocked = { ...done, unable_to_assess_count: 1 };
for (const [steps, expected] of [
  [[], "unreviewed"],
  [[done, done], "unreviewed"],
  [[yes, done], "partial"],
  [[yes, yes], "reproduced"],
  [[yes, { status: "running" }], "partial"],
  [[yes, no], "mixed"],
  [[no, done], "not_reproduced"],
  [[blocked, done], "unresolved"],
  [[{ ...yes, not_reproduced_count: 1 }], "mixed"],
  [[yes, { status: "cancelled" }], "reproduced"],
])
  assert.equal(campaignEvidence(steps).status, expected);
assert.deepEqual(campaignEvidence([yes, yes]), {
  reproducing_agents: 0,
  fully_reproducing_agents: 0,
  status: "reproduced",
  experiments: 2,
  completed: 2,
  active: 0,
  reproduced: 2,
  challenged: 0,
  unresolved: 0,
  reports: 2,
});
console.log(
  "PASS: campaign reproduction coverage, incomplete work, unresolved reports, conflicting evidence and completion vs verification",
);

assert.equal(
  campaignEvidence([
    { ...yes, reproducing_agent_keys: ["a", "a"] },
    { ...yes, reproducing_agent_keys: ["a"] },
  ]).fully_reproducing_agents,
  1,
);
assert.equal(
  campaignEvidence([
    { ...yes, reproducing_agent_keys: ["a"] },
    { ...yes, reproducing_agent_keys: ["b"] },
  ]).fully_reproducing_agents,
  0,
);
assert.equal(
  campaignEvidence([
    { ...yes, reproducing_agent_keys: ["a", "b"] },
    { ...yes, reproducing_agent_keys: ["a", "b"] },
  ]).fully_reproducing_agents,
  2,
);
console.log(
  "PASS: distinct agent identities, repeated reports and full-campaign coverage per identity",
);
