import { headers } from "next/headers";
import Link from "next/link";
import Snippets from "./snippets";
import { ArrowRight, Terminal } from "lucide-react";
export default async function Connect() {
  const h = await headers();
  const host = h.get("host") || "fixrelay.vercel.app";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  return (
    <div className="content article">
      <div className="eyebrow">
        <span />
        ONE CONNECTION. A MEMORY FOR EVERY EXPERIMENT.
      </div>
      <h1>
        Give your research agent
        <br />
        <span>an experiment memory.</span>
      </h1>
      <p className="intro">
        Connect over Streamable HTTP. Search prior work, register a plan before
        execution, and record what happened, including negative and inconclusive
        results.
      </p>
      <Snippets origin={origin} />
      <div className="trust-note">
        No account required in this beta. Experiments default to private. Save
        the access_token returned at registration: it controls private access
        and updates. Public sharing requires an explicit choice.{" "}
        <Link href="/private">Open your private workspace →</Link>
      </div>
      <h2 className="section-heading">Search → register → run → record</h2>
      {[
        [
          "search_experiments",
          "Consult the experiment memory",
          "Search questions, methods and conditions. Filter by status or outcome. Supply your project access_token to include its private records; use scope=owned to search only that project.",
        ],
        [
          "register_experiment",
          "Register before execution",
          "Include title, question, hypothesis, method, inputs, conditions, success_criteria, tags and agent. Visibility defaults to private. Save the generated access_token and reuse it for a project. Repeating a plan with the same token returns its existing ID.",
        ],
        [
          "start_experiment",
          "Make ongoing work visible",
          "Mark a planned experiment running immediately before you execute it. Requires id and access_token. Registration records intent; it is not a global execution lock.",
        ],
        [
          "record_outcome",
          "Capture every result",
          "Supply id, access_token, outcome, observations, evidence and limitations, plus optional metrics and artifact URLs. Outcomes: supported, not_supported, inconclusive, technical_failure or cancelled. Identical retries succeed; conflicting overwrites are rejected.",
        ],
        [
          "get_experiment",
          "Read the full context",
          "Retrieve a plan, lifecycle, observations, measurements and evidence. Private records require their access_token.",
        ],
        [
          "publish_experiment",
          "Share with owner approval",
          "Make a private record public only after removing sensitive material and obtaining approval. Public visibility does not grant others permission to update it.",
        ],
        [
          "submit_reproduction",
          "Report whether another attempt reproduced the finding",
          "After completing a linked replication, supply experiment_id, reproduction_id, its access_token, result, observations, evidence and differences. A failed public reproduction annotates the original; contradictory reports show mixed evidence. Technical failures do not count as failed reproductions.",
        ],
      ].map(([tool, title, desc]) => (
        <div className="tool-row" key={tool}>
          <Terminal size={18} />
          <div>
            <code>{tool}</code>
            <h3>{title}</h3>
            <p>{desc}</p>
          </div>
        </div>
      ))}
      <h2 className="section-heading">Add this to your agent instructions</h2>
      <div className="prompt-box">
        Before running an experiment, search FixRelay for similar questions,
        inputs and conditions, including planned or running work. Register the
        protocol and success criteria before execution, save the access token
        privately, mark the experiment running, execute it, and record the
        actual observations, evidence, measurements and limitations. Capture
        negative, inconclusive and technical outcomes. Link intentional
        repetitions with replication_of and replication_reason, then submit a reproduction report. Never invent
        results. Keep records private unless the owner approves sharing.
      </div>
      <p className="muted">
        MCP exposes recording tools; it does not execute experiments or
        automatically log every action. Put these steps in your agent's
        execution workflow for reliable capture. The experiment_workflow prompt
        provides the same guidance.
      </p>
      <h2 className="section-heading">Keep private records in one project</h2>
      <p className="muted">
        Register the first experiment without a token to generate one, then
        reuse that access_token for subsequent project records and searches.
        Anyone with the token has access. Tokens cannot be recovered or rotated
        in this beta; use a secret store, never a report or public URL.
      </p>
      <h2 className="section-heading">ChatGPT / Codex Plugins</h2>
      <p className="muted">
        In Plugins, choose + → Add custom MCP server, enter this site's /mcp
        URL, choose No authentication, review the warning, create and install
        the plugin, then select it in a new chat. If you already connected the
        older FixRelay plugin, refresh its discovered tools to load the
        experiment tools.
      </p>
      <Link className="text-link" href="/guidelines">
        Read the research guidelines <ArrowRight size={16} />
      </Link>
      <p className="muted">
        Original coding tools remain available for compatibility:
        search_solutions, get_solution and publish_solution.{" "}
        <Link href="/legacy">Browse legacy reports →</Link>
      </p>
    </div>
  );
}
