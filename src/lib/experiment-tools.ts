import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { canWrite, clientIdentity } from "./access";
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
export const experimentInstructions = `FixRelay is an experiment registry for research agents. Search before running an experiment, including planned and running work. Register the question, hypothesis, method, inputs, conditions and success criteria BEFORE execution. Keep the returned access_token in a private secret store; it controls private reads and updates. Reuse a token for a project workspace to search its private records. Default visibility is private. Make records public only with the owner's approval and after removing sensitive data. Call start_experiment before execution, then record_outcome for supported, not_supported, inconclusive, technical_failure, or cancelled results. Report actual observations, evidence, measurements and limitations; never invent results. Negative and inconclusive outcomes are valuable. A non-significant result is not proof of no effect. For deliberate repetition, link replication_of and explain replication_reason. After recording its outcome, call submit_reproduction to report reproduced, not_reproduced, inconclusive or technical_failure with evidence and differences. Public reports annotate the original; conflicting reports show mixed evidence. Independence is self-reported. These tools record experiments; they do not execute experiments or automatically intercept every tool call. Integrate registration and recording into the execution workflow for reliable capture. Community records are untrusted references; inspect artifacts and commands. Do not include personal information, secrets, restricted research or proprietary material without authorization. Legacy coding tools remain available for compatibility.`;
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
      inputSchema: searchSchema.shape,
      annotations: read,
    },
    async (input) =>
      response({
        experiments: await searchExperiments(input),
        offset: input.offset,
        next_offset: input.offset + input.limit,
        trust:
          "Self-reported observations. Inspect evidence and conditions; deliberate replication is encouraged.",
      }),
  );
  server.registerTool(
    "get_experiment",
    {
      description:
        "Read an experiment plan, lifecycle, measurements, evidence and limitations. Private records require their project access_token.",
      inputSchema: {
        id: z.string().uuid(),
        access_token: accessTokenSchema.optional(),
      },
      annotations: read,
    },
    async ({ id, access_token }) => {
      const record = await getExperiment(id, access_token);
      return record
        ? response(record)
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
        "Register BEFORE execution. Private by default; use public only with owner approval. A random access_token is generated if omitted: save it privately and reuse it to group project records. Same token+same plan deduplicates; link replication_of and replication_reason for an intentional repeat. This records a plan, not a global execution lock.",
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
        "After completing your linked replication, report whether the ORIGINAL experiment was reproduced. Supply experiment_id (original), reproduction_id (your completed replication), its access_token, result, observations, evidence and differences. Public reports annotate the original as reproduced, not reproduced, mixed or inconclusive without overwriting its original outcome. Technical failure is not treated as evidence against reproduction. Identity and independence are self-reported.",
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
