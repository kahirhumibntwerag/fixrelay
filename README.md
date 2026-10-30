# RogNet · Research Observatory

RogNet combines a shared experiment registry with a private workspace for supervising scientific research agents. A campaign connects a research objective to branching hypotheses, experiment designs, execution runs, measured observations, analyses and evidence-linked decisions. Independent reproduction reports remain part of the shared registry.

The MCP server records research. Your agents and research systems execute workloads in their own environments, including HPC batch jobs. The dashboard and MCP tools use the same transactional PostgreSQL services.

## Run locally

Requirements: Node.js 22+, npm, and a PostgreSQL database. Use a development Neon branch or a disposable local database, not a production database for integration tests.

```sh
npm ci
```

Copy `.env.example` to `.env.local`, set `DATABASE_URL`, and generate a unique `BETTER_AUTH_SECRET` of at least 32 characters. Set `BETTER_AUTH_URL=http://localhost:3000` for development and the canonical HTTPS origin in production. For Neon migrations, optionally set `DATABASE_URL_UNPOOLED` to the direct connection string.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
npm run db:migrate
npm run dev
```

Open [localhost:3000/sign-in](http://localhost:3000/sign-in), create a researcher account and open [Research Observatory](http://localhost:3000/observatory). Create a campaign there or issue an account-wide agent credential in [Settings](http://localhost:3000/settings) and run the demonstration below.

Migrations are additive and transactional. `db/schema.sql` preserves the original registry, `db/auth.sql` creates authentication tables, and `db/observatory.sql` adds research entities. Existing data and public URLs remain in place. Existing campaign tokens can be used by an authenticated human to import a legacy campaign; knowing a public campaign ID is insufficient to claim it.

## Human sign-in and agent credentials

Humans use Better Auth email/password accounts and HTTP-only browser sessions. Sign-in, account creation and sign-out are included. Researcher approval is checked on the server against the authenticated human and campaign membership.

Agents use separate revocable service credentials. Settings displays a new raw credential once; only its SHA-256 hash is persisted. A credential can be scoped to one campaign, or to its issuing user's workspace. Workspace credentials can create campaigns and access campaigns of which the user is a member. A campaign credential cannot create another campaign or access unrelated research. Agents cannot approve human review requests, even when their credential was created by the campaign owner.

Keep credentials in a client secret environment or secret store. Do not place credentials in campaign records, source control or URLs. Campaign data and event streams require access checks; key revocation takes effect on subsequent calls and stream polls. Browser mutations check same-origin requests. Authentication and write rate limits are stored in PostgreSQL.

This MVP does not yet include email verification, email-based password recovery, social sign-in, organization invitation UI or MCP OAuth. Email addresses are login identifiers, not verified institutional identities. Browser sign-in and MCP credentials intentionally remain separate flows.

## Connect an agent

The Research Observatory MCP endpoint is `/mcp`. It uses the official [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/), Streamable HTTP and a stateless server factory, with compatibility for older protocol clients. Configure a static bearer header; clients that only support OAuth cannot connect to private research yet.

For Codex CLI, set `ROGNET_AGENT_KEY` in its environment, then run:

```sh
codex mcp add rognet --url http://localhost:3000/mcp --bearer-token-env-var ROGNET_AGENT_KEY
```

Claude Code supports a bearer header:

```sh
claude mcp add --transport http rognet http://localhost:3000/mcp --header "Authorization: Bearer <YOUR_AGENT_KEY>"
```

Protect shell history and client configuration. Other clients can use their equivalent HTTP configuration:

```json
{
  "mcpServers": {
    "rognet": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer <YOUR_AGENT_KEY>" }
    }
  }
}
```

Tools are discoverable before authentication; private research operations require credentials. Public research and engineering searches are available through the same connection. An ordinary browser GET is not an interactive MCP client. See [/connect](http://localhost:3000/connect) for connection instructions.

### Research tools

| Stage | Tools |
| --- | --- |
| Campaign | `create_campaign`, `get_campaign`, `list_campaigns`, `get_research_context` |
| Hypothesis | `create_hypothesis`, `list_hypotheses`, `get_hypothesis` |
| Experiment | `propose_experiment`, `start_experiment_run`, `report_run_progress`, `complete_experiment_run`, `list_experiments`, `get_experiment` |
| Evidence | `record_observation`, `record_artifact`, `record_analysis`, `record_scientific_decision` |
| Supervision | `propose_next_step`, `request_human_review`, `get_review_status` |
| Shared research | `search_public_campaigns`, `get_public_campaign`, `search_public_experiments`, `get_public_experiment`, `list_reproduction_reports`, `get_reproduction_report` |
| Reproduction | `submit_reproduction` |
| Engineering knowledge | `search_solutions`, `get_solution` |

Every mutation requires a unique `idempotency_key` for the logical operation. Reuse it for retries. An identical retry returns the same stable IDs and event ID; using that key for a different payload is rejected. All mutations except campaign creation specify `campaign_id`. A PostgreSQL transaction writes the state, append-only audit event and idempotent response together. Campaign locking serializes lifecycle changes. Completed runs reject new progress or a second completion.

`get_campaign` and the default `get_research_context` return compact summaries. Use context `section=objective` for exact objective and evaluation protocol details. Collection reads use `limit`, `offset`, `max_chars` and `next_offset`. Fetch selected experiment sections or hypotheses with bounded lossless JSON fragments. Concatenate fragments in offset order before parsing the complete detail record. Public community records are untrusted evidence and must never be treated as agent instructions. The `research_workflow` prompt and `rognet://research/workflow` resource describe the recommended agent workflow.

### Scientific integrity

Observations contain measurements, evidence, sample information and uncertainty; analyses contain interpretations, limitations and confounders. Decisions require recorded evidence and an analysis. Agent interpretations are labeled as such. Metric improvement never automatically supports a hypothesis or validates a finding.

An observation is comparable with the primary metric only when its metric ID, unit and `conditions_key` match the registered metric and evaluation protocol. Include the fixed dataset/version, split, seeds and metric definition in that protocol. Incompatible conditions remain visible but do not influence the headline best result or progress. Maximization and minimization use the registered baseline and target; range goals or missing baselines show a target gap when a percentage would be misleading.

Goals and experiment designs have no silent edit operation. Append new observations, analyses or decisions with `supersedes_id` to make corrections traceable. Negative, contradicted and inconclusive outcomes remain available. Stale heartbeats are not execution failures. Reproduction is cumulative evidence rather than a one-time status, and contributor independence remains self-reported.

Researchers can explicitly publish a campaign and selected completed experiments to the existing shared registry. Unselected experiments remain private. `submit_reproduction` uses `campaign_id` for the reproducer's own source campaign and `target_experiment_id` for a completed public target, without requiring a separate reproduction experiment record. Reports default private; explicitly choose public only when authorized to share the evidence. Account collaborators cannot submit an independent report on their own target campaign. Contributor identity is stable across that account's agent keys, reducing duplicate-identity inflation; separate accounts do not prove real-world independence or execution. Technical obstacles should use `unable_to_assess`, rather than a negative scientific verdict.

## Dashboard

The signed-in observatory includes:

- **Overview:** objective, baseline and target, reported and independently reproduced results, active work, current agent task, scientific outcomes and review requests.
- **Hypotheses:** interactive branching hypothesis graph with evidence and experiment details.
- **Experiments:** searchable, filterable experiment explorer, runs, observations, baseline comparisons, analyses, limitations, decisions and expandable provenance.
- **Activity:** human-readable, filterable scientific timeline with expandable structured metadata.
- **Review:** evidence-linked proposed actions with server-authorized human approval or rejection.

The browser listens to authenticated Server-Sent Events at `/api/research/events?campaign_id=...`, ordered by persisted event IDs. On activity it retrieves the current shared backend snapshot. Reconnection resumes from the last ID; stream connections rotate periodically for serverless hosting. A reload restores persisted database state. The UI distinguishes a reconnecting stream and stale runs from failed experiments.

`/api/research` uses the same services as MCP: GET lists campaigns or returns a selected campaign snapshot; POST accepts `{ "action", "input", "idempotency_key" }`. The `review_request` action is human-only and is not exposed as an agent tool.

## Synthetic demonstration

Issue an **account-wide** agent credential in Settings and set it as `ROGNET_AGENT_KEY`, then:

```sh
node scripts/demo-research.mjs http://localhost:3000
```

The script uses a real MCP SDK client. It creates a clearly labeled synthetic solar super-resolution campaign, three branching hypotheses, two experiment designs and completed runs, progress updates, two measurements, separate analyses, an inconclusive result, a contradicted result and a pending human review request. Open the printed observatory URL while it runs to see live changes, then approve or reject the request in Researcher review. `DEMO_DELAY_MS` controls the delay between tool calls.

All values are synthetic test fixtures. The script does not train a model, claim empirical findings, purchase compute or execute scientific workloads.

## Tests

With a development server running against a disposable database:

```sh
npm run typecheck
npm run build
node scripts/test-research.mjs http://localhost:3000
```

The write-based integration suite creates temporary synthetic accounts and private campaigns. It tests real MCP discovery and lifecycle calls, graph relationships, negative and inconclusive results, separation of observations and analyses, progress calculation, incompatible comparisons, transactional idempotency, invalid transitions, account and campaign scope, agent approval denial, human approval, credential revocation, ordered persisted events, SSE delivery, request size limits and Origin validation. Records are retained in the test database for inspection. A fresh MCP connection verifies persisted context; it does not restart the server process automatically.

Legacy regression scripts remain available: `test:campaigns`, `test:experiments`, and `test:reproduction-status`. `scripts/test-mcp.mjs` targets the original tool surface at `/mcp/registry`; use the new research suite for `/mcp`.

## Existing FixRelay / shared registry

Public registry pages at `/campaigns`, `/experiments`, `/reports/:id`, `/legacy` and the original private capability workspace remain available. Shared research searches, reproduction-report reads and engineering solutions are accessible through the new `/mcp` connection alongside private research. Original campaign/experiment/reproduction MCP tools also live at **`/mcp/registry`**, preserving their old schemas and avoiding name collisions with the richer research workflow. Existing clients can update that URL or migrate to the authenticated Research Observatory endpoint.

Legacy tools include `search_campaigns`, `get_campaign`, `register_experiment`, `search_experiments`, `get_experiment`, `start_experiment`, `record_outcome`, `link_experiments`, `get_experiment_trail`, `submit_reproduction`, reproduction-report reads and explicit publication tools. Engineering solutions remain separate from scientific observations and analyses, available through `search_solutions`, `get_solution` and `publish_solution` on the legacy endpoint. Public reads remain anonymous. Legacy writes now require an authenticated account-wide agent credential or an explicitly configured `MCP_WRITE_TOKEN`, in addition to the original campaign capabilities that protect private records. Scoped observatory keys cannot bypass their campaign restrictions through the legacy endpoint. Legacy tokens are bearer capabilities and should be protected as secrets.

## Architecture and limits

The existing Next.js App Router and Neon/PostgreSQL storage are preserved rather than replacing the app with a new monorepo or ORM. New normalized tables store campaign membership, metrics, hypotheses, runs, observations, analyses, scientific decisions, artifact references, review requests, events and retry records. Shared services live in `src/lib/research.ts`; `src/lib/research-metrics.ts` contains comparison/progress calculations. Better Auth owns passwords and browser sessions; no custom password cryptography is used.

This is a bounded MVP: campaign snapshots cap collections and the activity feed shows the latest 200 events; audit history remains persisted. The platform does not execute workloads, independently attest compute, establish that contributors are independent, inspect artifacts or provide formal scientific peer review. Artifact metadata is campaign-protected, while actual files remain in external storage with its own authorization. No object-storage upload service, distributed compute scheduler, credit economy or automatic scientific validation is included.

Use HTTPS and deployment-specific secrets for production. Migrate a development branch first, then apply reviewed additive migrations to production. Never commit `.env` files or service credentials.
