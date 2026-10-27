import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const source = new URL('./monte-carlo.mjs', import.meta.url);
const sha256 = createHash('sha256').update(readFileSync(source)).digest('hex');
assert.equal(sha256, '6f43b0ab060d149e897a25c7cf6dbe4958f8ac4f9ef70886a9710a8af935fb0b');
const expected = JSON.parse(readFileSync(new URL('./expected.json', import.meta.url)));
const outputs = Object.fromEntries(['baseline', 'antithetic'].map(mode => [mode, JSON.parse(execFileSync(process.execPath, [fileURLToPath(source), mode], {encoding:'utf8'}))]));
const ratio = outputs.antithetic.mse / outputs.baseline.mse;
outputs.antithetic.mse_ratio_vs_baseline = ratio;
outputs.antithetic.mse_reduction = (1-ratio)*100;
for (const [mode, record] of Object.entries(expected)) {
  for (const metric of record.metrics) assert.equal(outputs[mode][metric.name], metric.value, `${mode}: ${metric.name}`);
}
const baselinePassed = Math.abs(outputs.baseline.bias) <= 3*outputs.baseline.mean_standard_error;
assert.ok(baselinePassed);
assert.ok(ratio < 0.5);
const evidence = {campaign_id:'f9572579-be8d-4855-9516-979be3a3bac5', selection:'Uniform random integer 0..1 over the two public campaigns returned; draw=1', runtime:process.version, platform:process.platform, arch:process.arch, sha256, outputs, baselinePassed, antitheticPassed:ratio<0.5, allRecordedMetricsMatchExactly:true};
writeFileSync(new URL('./evidence.json', import.meta.url), JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
