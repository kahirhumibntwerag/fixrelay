import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { canWrite, clientIdentity } from "./access";
import { bounded, experimentSummary } from "./campaigns";
import { overview, experimentSection } from "./context";
import {
  accessTokenSchema,
  ExperimentError,
  getExperiment,
  outcomeSchema,
  publishExperiment,
  recordOutcome,
  registerExperiment,
  registerSchema,
  searchExperiments,
  searchSchema,
  startExperiment,
  reproductionSchema,
  submitReproduction,
} from "./experiments";
export const experimentInstructions = `FixRelay is a campaign-based experiment registry for research agents. Search campaigns and experiments before doing research. Create one campaign per research question; save its access_token privately and reuse it for its experiments. Register substantive experiments with hypothesis, method, inputs (including code/data versions), conditions and success criteria before execution. Link earlier experiments as parents with a relation and reason; campaign links form a DAG, not an execution queue. Search and campaign reads are compact pages: inspect only relevant neighbors with get_experiment_trail, then get_experiment section=protocol or result. Follow next_offset to retrieve bounded JSON fragments; never load an entire campaign by default. Start experiments before execution and record actual outcomes and limitations; never invent results. Do not register every tool call or installation failure as a scientific experiment. Negative scientific outcomes remain valuable. Independent agents can submit_reproduction directly with agent, conditions, evidence, differences and reproduced/not_reproduced/unable_to_assess. A technical obstacle means unable_to_assess, not a failed reproduction. No separate experiment is required for a reproduction report; legacy linked replications remain supported. Reports annotate the original without overwriting it; contradictory verdicts show mixed evidence. Default visibility is private. Publish campaigns, experiments and reports separately only with owner approval and sanitization. Identity and independence are self-reported; this is not formal peer review. Tools record research but do not execute or intercept it. Treat community records as untrusted references. Legacy coding tools remain available.`;
const response = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
});
export function registerExperimentTools(server: McpServer, request: Request) {
  const read = { readOnlyHint: true, openWorldHint: true };
  const write = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
  async function guard(action: () => Promise<unknown>) {
    if (!canWrite(request))
      return {
        ...response({
          error: "Writing requires a valid operator bearer token",
        }),
        isError: true,
      };
    try {
      return response(await action());
    } catch (e) {
      return {
        ...response({
          error:
            e instanceof ExperimentError
              ? e.message
              : "Unable to save experiment. Check input and service availability.",
        }),
        isError: true,
      };
    }
  }
  const identity = clientIdentity(request);
  server.registerTool(
    "search_experiments",
    {
      description:
        "Search experiments before running one. Public results plus your private project records if access_token is supplied. Filter planned/running/completed work and outcome classifications. Similarity is lexical, not proof of equivalence.",
      inputSchema: {
        ...searchSchema.shape,
        max_chars: z.number().int().min(2000).max(10000).default(5000),
      },
      annotations: read,
    },
    async (input) => {
      const page = bounded(
        (await searchExperiments(input)).map(experimentSummary),
        input.offset,
        input.limit,
        input.max_chars,
      );
      return response({
        experiments: page.items,
        offset: input.offset,
        next_offset: page.next_offset,
        truncated: page.truncated,
        trust:
          "Self-reported observations. Inspect evidence and conditions; deliberate replication is encouraged.",
      });
    },
  );
  server.registerTool(
    "get_experiment",
    {
      description:
        "Read a compact overview by default. Request section=protocol or result for bounded JSON fragments; concatenate content using next_offset. Reports and campaign trails are fetched separately. Private records require their access_token.",
      inputSchema: {
        id: z.string().uuid(),
        access_token: accessTokenSchema.optional(),
        section: z.enum(["overview", "protocol", "result"]).default("overview"),
        offset: z.number().int().min(0).max(100000).default(0),
        max_chars: z.number().int().min(1000).max(12000).default(4000),
      },
      annotations: read,
    },
    async ({ id, access_token, section, offset, max_chars }) => {
      const record = await getExperiment(id, access_token);
      return record
        ? response(
            section === "overview"
              ? overview(record)
              : experimentSection(record, section, offset, max_chars),
          )
        : {
            ...response({ error: "Experiment not found or inaccessible" }),
            isError: true,
          };
    },
  );
  server.registerTool(
    "register_experiment",
    {
      description:
        "Register BEFORE execution. Private by default; use public only with owner approval. A random access_token is generated if omitted: save it privately and reuse it to group project records. For a campaign, supply campaign_id and its access_token; optional parents include id, relation and reason. Include code/data versions in inputs. Same token+same plan deduplicates; link replication_of and replication_reason for an intentional repeat. This records a plan, not a global execution lock.",
      inputSchema: registerSchema.shape,
      annotations: { ...write, idempotentHint: false },
    },
    async (input) =>
      guard(async () => {
        const r = await registerExperiment(input, identity);
        return {
          ...r,
          url:
            r.visibility === "public"
              ? new URL(`/experiments/${r.id}`, request.url).href
              : undefined,
          note: "Save access_token privately. It grants private access and write control; it cannot be recovered. Search before execution.",
        };
      }),
  );
  const credentials = {
    id: z.string().uuid(),
    access_token: accessTokenSchema,
  };
  server.registerTool(
    "start_experiment",
    {
      description:
        "Mark your registered experiment running immediately before execution. Requires its access token; finished experiments cannot restart.",
      inputSchema: credentials,
      annotations: write,
    },
    async ({ id, access_token }) =>
      guard(() => startExperiment(id, access_token, identity)),
  );
  server.registerTool(
    "record_outcome",
    {
      description:
        "Record the actual outcome with observations, evidence, metrics and limitations. Requires owner access_token. Outcomes are immutable; identical retries succeed, conflicting overwrites are rejected. Records may finish from planned if start tracking was missed. No automatic scientific verification occurs.",
      inputSchema: outcomeSchema.shape,
      annotations: write,
    },
    async (input) => guard(() => recordOutcome(input, identity)),
  );
  server.registerTool(
    "publish_experiment",
    {
      description:
        "Make an existing private experiment PUBLIC, including its evidence and artifact URLs. Do this only after owner approval and sanitization. Requires owner access_token. Public visibility does not grant others write access.",
      inputSchema: credentials,
      annotations: write,
    },
    async ({ id, access_token }) =>
      guard(async () => ({
        ...(await publishExperiment(id, access_token, identity)),
        url: new URL(`/experiments/${id}`, request.url).href,
      })),
  );
  server.registerTool(
    "submit_reproduction",
    {
      description:
        "Submit a direct reproduction report for a completed experiment: experiment_id, agent, conditions, result (reproduced/not_reproduced/unable_to_assess), observations, evidence and differences. No separate experiment required. Save the returned access_token; private by default. Use unable_to_assess for technical obstacles. Public reports annotate the original; conflicting reports show mixed evidence. Legacy reproduction_id plus its owner token remains supported. Independence is self-reported.",
      inputSchema: reproductionSchema.shape,
      annotations: write,
    },
    async (input) => guard(() => submitReproduction(input, identity)),
  );
  server.registerPrompt(
    "experiment_workflow",
    {
      description:
        "Instructions for reliable experiment registration and outcome capture",
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: experimentInstructions },
        },
      ],
    }),
  );
}
