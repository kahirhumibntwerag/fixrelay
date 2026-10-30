import assert from "node:assert/strict";
import { compatibleObservation, metricProgress } from "../src/lib/research-metrics.ts";

// A rising quality metric and a falling error metric should represent the same
// halfway progress when each moves halfway from its baseline to its target.
assert.deepEqual(metricProgress({ direction: "maximize", baseline: 28, target: 30 }, 29), { progress_percent: 50, target_gap: 1 });
assert.deepEqual(metricProgress({ direction: "minimize", baseline: 100, target: 40 }, 70), { progress_percent: 50, target_gap: 30 });
assert.deepEqual(metricProgress({ direction: "minimize", baseline: 100, target: 40 }, 110), { progress_percent: 0, target_gap: 70 });
assert.deepEqual(metricProgress({ direction: "maximize", baseline: 28, target: 30 }, 31), { progress_percent: 100, target_gap: -1 });
// A range has a meaningful gap, but no unique percentage scale.
assert.deepEqual(metricProgress({ direction: "range", baseline: 0, target: 10, target_max: 20 }, 25), { progress_percent: null, target_gap: 5 });
assert.deepEqual(metricProgress({ direction: "range", baseline: 0, target: 10, target_max: 20 }, 15), { progress_percent: null, target_gap: 0 });
assert.deepEqual(metricProgress({ direction: "maximize", baseline: null, target: 30 }, 29), { progress_percent: null, target_gap: 1 });
assert.deepEqual(metricProgress({ direction: "maximize", baseline: 30, target: 30 }, 29), { progress_percent: null, target_gap: 1 });
assert.deepEqual(metricProgress({ direction: "minimize", baseline: 10, target: 40 }, 20), { progress_percent: null, target_gap: -20 });
assert.deepEqual(metricProgress({ direction: "maximize", baseline: 28, target: 30 }, null), { progress_percent: null, target_gap: null });
assert.deepEqual(metricProgress({ direction: "maximize", baseline: 28, target: 30 }, Number.NaN), { progress_percent: null, target_gap: null });

const metric = { id: "psnr", unit: "dB", evaluation_protocol: "dataset-v1;split=fixed;seed=42;metric=psnr-v1" };
const observation = { metric_id: metric.id, unit: metric.unit, conditions_key: metric.evaluation_protocol };
assert.equal(compatibleObservation(metric, observation), true);
for (const change of [{ metric_id: "another-metric" }, { unit: "m/s" }, { conditions_key: "dataset-v2;split=different" }]) {
  assert.equal(compatibleObservation(metric, { ...observation, ...change }), false);
}
console.log("PASS: meaningful metric directions, bounded progress, missing/invalid baselines, range target gaps, and evaluation compatibility");
