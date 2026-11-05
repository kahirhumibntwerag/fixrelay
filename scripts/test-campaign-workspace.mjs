import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { connectResearch, runSyntheticScenario, toolData } from "./demo-research.mjs";

const base = new URL(process.argv[2] || "http://localhost:3105").origin;
assert(["localhost","127.0.0.1","[::1]"].includes(new URL(base).hostname),"Workspace tests require a disposable local server");
async function account() {
  const response = await fetch(`${base}/api/auth/sign-up/email`,{method:"POST",headers:{"Content-Type":"application/json",Origin:base,"x-forwarded-for":`127.${randomBytes(1)[0]}.${randomBytes(1)[0]}.1`},body:JSON.stringify({name:"Synthetic workspace test",email:`workspace-${randomUUID()}@example.test`,password:randomBytes(24).toString("base64url")})});
  assert.equal(response.status,200,await response.clone().text());
  return response.headers.getSetCookie().map(cookie=>cookie.split(";")[0]).join("; ");
}
async function request(path,cookie,body) {
  const response=await fetch(`${base}${path}`,{method:body ? "POST":"GET",headers:{...(cookie ? {Cookie:cookie}:{}),Origin:base,"Content-Type":"application/json"},...(body ? {body:JSON.stringify(body)}:{})});
  const value=await response.json(); return {status:response.status,value};
}
async function key(cookie) {const result=await request("/api/agent-keys",cookie,{name:"Synthetic workspace agent",campaign_id:null});assert.equal(result.status,201,JSON.stringify(result.value));return result.value.token;}
const clients=[];
try {
  const owner=await account(), outsider=await account();
  const client=await connectResearch(base,await key(owner)); clients.push(client);
  const other=await connectResearch(base,await key(outsider)); clients.push(other);
  const anon=await connectResearch(base,null); clients.push(anon);
  const call=async (who,name,args) => toolData(await who.callTool({name,arguments:args}));
  const write=(name,args,key=randomUUID())=>call(client,name,{...args,idempotency_key:key});
  const fixture=await runSyntheticScenario(client), campaign_id=fixture.campaign.id;
  const scope={campaign_id};
  const longText="technical details and precise settings; ".repeat(285).trim();
  const briefInput={...scope,overview:longText,findings:longText,methods_and_protocols:longText,experiments:longText,decisions:longText,reproducibility:longText,failed_approaches:longText,limitations:longText,open_questions:longText,next_steps:longText,evidence_ids:[fixture.observations[0].id]};
  await write("update_campaign_brief",briefInput);
  let brief=await call(client,"get_campaign_brief",scope);
  assert.equal(brief.brief.overview,longText);assert.equal(brief.brief.reproducibility,longText);assert.equal(brief.brief.stale,false);
  const denied=await other.callTool({name:"get_campaign_brief",arguments:scope});assert.equal(denied.isError,true);
  const table=await write("create_comparison_table",{...scope,title:"Model comparison",columns:["Model","Accuracy"],rows:[["A",1]]});
  await write("add_comparison_table_version",{...scope,table_id:table.id,columns:["Model","Accuracy"],rows:[["A",2]],note:"Second measurement"});
  let tables=await call(client,"list_comparison_tables",scope);assert.equal(tables.tables[0].versions.length,2);
  brief=await call(client,"get_campaign_brief",scope);assert.equal(brief.brief.stale,true);
  const chart=await write("create_series_chart",{...scope,title:"Accuracy over steps",x_label:"Step",y_label:"Accuracy"});
  const points=[{series:"baseline",x:1,y:2,observed_at:"2026-01-01T00:00:00Z",run_id:fixture.runs[0].id},{series:"candidate",x:2,y:3,observed_at:"2026-01-02T00:00:00Z"}];
  const retryKey=randomUUID();await write("append_series_points",{...scope,chart_id:chart.id,points},retryKey);await write("append_series_points",{...scope,chart_id:chart.id,points},retryKey);
  let data=await call(client,"get_series_chart",{...scope,chart_id:chart.id});assert.equal(data.points.length,2,"retry must not duplicate points");
  assert.equal((await call(anon,"list_public_series_charts",scope)).charts.length,0);
  const publish=await request("/api/research",owner,{action:"publish_campaign",input:{...scope,experiment_ids:[fixture.experiments[0].id],chart_ids:[chart.id],table_ids:[table.id]},idempotency_key:randomUUID()});assert.equal(publish.status,200,JSON.stringify(publish.value));
  await write("append_series_points",{...scope,chart_id:chart.id,points:[{series:"candidate",x:3,y:5,observed_at:"2026-01-03T00:00:00Z"}]});
  await write("add_comparison_table_version",{...scope,table_id:table.id,columns:["Model","Accuracy"],rows:[["A",3]]});
  data=await call(anon,"get_public_series_chart",{...scope,chart_id:chart.id});assert.equal(data.points.length,2,"new points must remain private");assert.equal(data.points[0].run_id,null);
  tables=await call(anon,"list_public_comparison_tables",scope);assert.equal(tables.tables[0].rows[0][1],2,"new table versions must remain private");assert.equal(tables.tables[0].versions,undefined);
  const republish=await request("/api/research",owner,{action:"publish_campaign",input:{...scope,experiment_ids:[],chart_ids:[chart.id],table_ids:[table.id]},idempotency_key:randomUUID()});assert.equal(republish.status,200,JSON.stringify(republish.value));
  assert.equal((await call(anon,"get_public_series_chart",{...scope,chart_id:chart.id})).points.length,3);
  assert.equal((await call(anon,"list_public_comparison_tables",scope)).tables[0].rows[0][1],3);
  await write("remove_chart",{...scope,chart_id:chart.id});
  assert.equal((await call(anon,"list_public_series_charts",scope)).charts.length,0);
  console.log("PASS: detailed MCP briefs, access control, staleness, table versions, series chart idempotency, private updates, publication and removal");
} finally {await Promise.all(clients.map(client=>client.close()));}
