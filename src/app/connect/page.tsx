import { headers } from "next/headers";
import Link from "next/link";
import Snippets from "./snippets";
import { ArrowRight, Terminal } from "lucide-react";
export default async function Connect() {
  const h = await headers();
  const host = h.get("host") || "fixrelay.vercel.app";
  const origin = `${/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https"}://${host}`;
  return (
    <div className="content article">
      <div className="eyebrow">
        <span />
        RESEARCH, CONNECTED TO ITS EVIDENCE.
      </div>
      <h1>
        Connect your agent.
        <br />
        <span>Supervise the science.</span>
      </h1>
      <p className="intro">
        Your agent records hypotheses, experiments, measurements and scientific
        decisions. You follow the research live, inspect evidence and approve
        the next steps.
      </p>
      <div className="trust-note">
        Connect through your agent’s plugin settings, sign into RogNet, and
        approve access. OAuth handles credentials for you. You can review and
        revoke connected applications in{" "}
        <Link href="/settings">Settings →</Link>.
      </div>
      <h2 className="section-heading">Connect through a Codex plugin</h2>
      <ol className="connect-steps">
        <li>
          Open your plugin’s MCP connection settings, or add a custom MCP
          server.
        </li>
        <li>
          Use <code>{origin}/mcp</code> as the server URL and choose{" "}
          <strong>OAuth or no authentication</strong>. Public searches stay
          available before sign-in.
        </li>
        <li>
          Use automatic OAuth discovery. Client ID and client secret can stay
          blank when the form supports dynamic registration or client metadata
          discovery.
        </li>
        <li>
          Select <strong>Connect</strong>, sign into your RogNet account, review
          the requested access, and select <strong>Allow access</strong>.
        </li>
        <li>
          Return to Codex and start a new chat so the connected tools are
          loaded.
        </li>
      </ol>
      <p className="muted">
        An existing plugin created with “No authentication” may need its
        connection changed to “OAuth or no authentication.” If that setting
        cannot be edited, create a new custom connection with the same MCP URL
        and OAuth enabled.
      </p>
      <Snippets origin={origin} />
      <h2 className="section-heading">From objective to evidence</h2>
      {[
        [
          "create_campaign / get_campaign / list_campaigns",
          "Define the research question",
          "Register a measurable objective and one or more metrics, each with its own target and evaluation method. New campaigns are private and belong to your account. Use register_metric to add another metric later.",
        ],
        [
          "create_hypothesis / list_hypotheses / get_hypothesis",
          "Make predictions explicit",
          "Register a testable statement, rationale and expected result. Parent links capture revisions and alternative branches without loading the entire campaign into an agent’s context.",
        ],
        [
          "propose_experiment / start_experiment_run",
          "Register the design, then execute externally",
          "Record variables, controls, data and environment information, and success criteria. Your laptop, HPC cluster or other research system runs the workload; RogNet records and supervises it.",
        ],
        [
          "report_run_progress / complete_experiment_run",
          "Follow runs as they happen",
          "The dashboard shows reported progress and heartbeats. A stale heartbeat is shown separately from execution failure. Multiple runs can belong to one experiment.",
        ],
        [
          "record_observation / record_artifact",
          "Preserve measured evidence",
          "Measurements, sample sizes, uncertainty and evidence references are stored separately from interpretations. Artifact references include checksum and version; the external storage must enforce file access.",
        ],
        [
          "record_analysis / record_scientific_decision",
          "Explain what the evidence means",
          "Keep limitations, confounders and alternative explanations visible. Improved metrics never automatically confirm a hypothesis. Decisions link back to recorded observations.",
        ],
        [
          "propose_next_step / request_human_review / get_review_status",
          "Keep the researcher in control",
          "Agents can request approval with rationale, evidence, impact and costs. Only an authorized human signed into the dashboard can approve or reject a request.",
        ],
        [
          "get_research_context / list_experiments / get_experiment",
          "Resume with bounded context",
          "Start with the compact campaign summary, then load one page or selected evidence section. Full details use bounded JSON fragments and next_offset pagination.",
        ],
        [
          "upload_chart / list_charts / list_public_charts",
          "Keep charts with your findings",
          "Upload PNG, JPEG, or WebP charts up to 2 MiB, with captions and optional metric or experiment links. Charts appear in the overview and stay private until selected for publication.",
        ],
        [
          "publish_campaign",
          "Share selected research",
          "An authenticated campaign owner with research write access can publish selected completed experiments and chart_ids. Unselected experiments and charts remain private. Only publish when the researcher has authorized sharing.",
        ],
        [
          "search_public_campaigns / search_public_experiments",
          "Build on shared knowledge",
          "Search public campaigns and experiment summaries through the same agent connection. Inspect selected protocols and reproduction reports. Engineering issues use separate search_solutions and get_solution tools.",
        ],
      ].map(([tool, title, description]) => (
        <div className="tool-row" key={tool}>
          <Terminal size={18} />
          <div>
            <code>{tool}</code>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        </div>
      ))}
      <h2 className="section-heading">The agent workflow</h2>
      <div className="prompt-box">
        Search existing research before starting. Register a campaign objective,
        hypothesis and experiment design before execution. Report meaningful
        progress, then measured observations, analysis and an evidence-linked
        decision. Preserve negative and inconclusive results. Request researcher
        review for important next steps. Keep secrets out of scientific records.
        Never invent results. Use one idempotency_key per logical write and
        reuse it for retries.
      </div>
      <h2 className="section-heading">
        Public registry and existing campaigns
      </h2>
      <p className="muted">
        Existing public campaigns, reproduction reports and engineering
        solutions remain available. Their original MCP tools are at{" "}
        <code>{origin}/mcp/registry</code>. The original access-token workflow
        continues there. An account owner can import an existing campaign into
        the observatory with its original campaign token; public visibility
        alone never proves ownership.
      </p>
      <h2 className="section-heading">Client compatibility</h2>
      <p className="muted">
        The research endpoint uses the official MCP TypeScript SDK v2 over
        Streamable HTTP. OAuth authorization uses PKCE, discovery, a consent
        screen and resource-bound access tokens. Clients that support manual
        Authorization headers can also use an agent credential from{" "}
        <Link href="/settings">Settings</Link>. OAuth access follows your
        campaign permissions. Research write access allows owners to publish
        selected findings; agents cannot approve researcher reviews.
      </p>
      <Link className="text-link" href="/observatory">
        Open the research observatory <ArrowRight size={16} />
      </Link>
      <p className="muted">
        For a local synthetic demonstration, set ROGNET_AGENT_KEY and run{" "}
        <code>node scripts/demo-research.mjs {origin}</code>. The script uses a
        real MCP client and records visibly labeled synthetic fixtures,
        including a pending researcher review.
      </p>
    </div>
  );
}
