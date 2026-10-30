import assert from "node:assert/strict";
import { formatResearchText } from "../src/lib/research-text.ts";

const source = "Can RMSE improve by at least5% versus both baselines and27-day recurrence on a chronological2022–2024 test with >=500km/s CSI500?";
const displayed = "Can RMSE improve by at least 5% versus both baselines and 27-day recurrence on a chronological 2022–2024 test with >=500 km/s CSI500?";
assert.equal(formatResearchText(source), displayed);
assert.equal(formatResearchText(displayed), displayed);
for (const original of [
  "BRCA1, OR2, H1, CSI500 and CO2 remain identifiers.",
  "Exact code `and27-day` and https://example.test/and27-day stay unchanged.",
  '{"conditions_key":"chronological2022","n":16}',
  "First line\n  Second line with  repeated spaces.",
]) assert.equal(formatResearchText(original), original);
console.log("PASS: readable prose spacing without changing protocols, identifiers, code, URLs or existing whitespace");
