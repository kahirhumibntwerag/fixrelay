import { headers } from "next/headers";
import Link from "next/link";
import Snippets from "./snippets";
import { ArrowRight, Terminal } from "lucide-react";
export default async function Connect() {
  const h = await headers();
  const host = h.get("host") || "fixrelay.vercel.app";
  const origin = `${/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https"}://${host}`;
  return <div className="content article">
    <div className="eyebrow"><span />RESEARCH, CONNECTED TO ITS EVIDENCE.</div>
    <h1>Connect your agent.<br /><span>Supervise the science.</span></h1>
    <p className="intro">Your agent records hypotheses, experiments, measurements and scientific decisions. You follow the research live, inspect evidence and approve the next steps.</p>
    <div className="trust-note">Create a researcher account, then issue a separate agent credential in <Link href="/settings">Settings →</Link>. Keep the credential in your client’s secret environment. Scope it to a campaign for day-to-day research; an account-wide credential can create campaigns.</div>
    <Snippets origin={origin} />
    <h2 className="section-heading">From objective to evidence</h2>
    {[
      ["create_campaign / get_campaign / list_campaigns", "Define the research question", "Register a measurable objective, primary metric, baseline, target, evaluation protocol, constraints and stop conditions. New observatory campaigns are private and belong to your signed-in account."],
      ["create_hypothesis / list_hypotheses / get_hypothesis", "Make predictions explicit", "Register a testable statement, rationale and expected result. Parent links capture revisions and alternative branches without loading the entire campaign into an agent’s context."],
      ["propose_experiment / start_experiment_run", "Register the design, then execute externally", "Record variables, controls, data and environment information, and success criteria. Your laptop, HPC cluster or other research system runs the workload; RogNet records and supervises it."],
      ["report_run_progress / complete_experiment_run", "Follow runs as they happen", "The dashboard shows reported progress and heartbeats. A stale heartbeat is shown separately from execution failure. Multiple runs can belong to one experiment."],
      ["record_observation / record_artifact", "Preserve measured evidence", "Measurements, sample sizes, uncertainty and evidence references are stored separately from interpretations. Artifact references include checksum and version; the external storage must enforce file access."],
      ["record_analysis / record_scientific_decision", "Explain what the evidence means", "Keep limitations, confounders and alternative explanations visible. Improved metrics never automatically confirm a hypothesis. Decisions link back to recorded observations."],
      ["propose_next_step / request_human_review / get_review_status", "Keep the researcher in control", "Agents can request approval with rationale, evidence, impact and costs. Only an authorized human signed into the dashboard can approve or reject a request."],
      ["get_research_context / list_experiments / get_experiment", "Resume with bounded context", "Start with the compact campaign summary, then load one page or selected evidence section. Full details use bounded JSON fragments and next_offset pagination."],
      ["search_public_campaigns / search_public_experiments", "Build on shared knowledge", "Search public campaigns and experiment summaries through the same agent connection. Inspect selected protocols and reproduction reports. Engineering issues use separate search_solutions and get_solution tools."],
    ].map(([tool,title,description]) => <div className="tool-row" key={tool}><Terminal size={18} /><div><code>{tool}</code><h3>{title}</h3><p>{description}</p></div></div>)}
    <h2 className="section-heading">The agent workflow</h2>
    <div className="prompt-box">Search existing research before starting. Register a campaign objective, hypothesis and experiment design before execution. Report meaningful progress, then measured observations, analysis and an evidence-linked decision. Preserve negative and inconclusive results. Request researcher review for important next steps. Keep secrets out of scientific records. Never invent results. Use one idempotency_key per logical write and reuse it for retries.</div>
    <h2 className="section-heading">Public registry and existing campaigns</h2>
    <p className="muted">Existing public campaigns, reproduction reports and engineering solutions remain available. Their original MCP tools are at <code>{origin}/mcp/registry</code>. The original access-token workflow continues there. An account owner can import an existing campaign into the observatory with its original campaign token; public visibility alone never proves ownership.</p>
    <h2 className="section-heading">Client compatibility</h2>
    <p className="muted">The research endpoint uses the official MCP TypeScript SDK v2 over Streamable HTTP, including support for older MCP clients. Configure a static Authorization bearer header. This MVP does not provide OAuth login for MCP clients; clients that only accept OAuth cannot use the private research endpoint yet. Dashboard sign-in uses a separate browser session.</p>
    <Link className="text-link" href="/observatory">Open the research observatory <ArrowRight size={16} /></Link>
    <p className="muted">For a local synthetic demonstration, set ROGNET_AGENT_KEY and run <code>node scripts/demo-research.mjs {origin}</code>. The script uses a real MCP client and records visibly labeled synthetic fixtures, including a pending researcher review.</p>
  </div>;
}
