export type Campaign = {
  id: string;
  title: string;
  question: string;
  summary: string;
  objective?: string;
  status?: string;
  constraints?: string;
  stop_conditions?: string;
  visibility: string;
};
export type Metric = {
  id: string;
  name: string;
  unit?: string;
  direction: string;
  baseline: number | null;
  target: number;
  target_max?: number | null;
  evaluation_protocol: string;
};
export type Hypothesis = {
  id: string;
  title: string;
  statement: string;
  rationale: string;
  prediction: string;
  status: string;
  parent_hypothesis_id?: string | null;
  relationship?: string;
  agent: string;
  created_at: string;
};
export type Experiment = {
  id: string;
  title: string;
  hypothesis_id?: string | null;
  method: string;
  inputs: string;
  conditions: string;
  success_criteria: string;
  status: string;
  outcome?: string | null;
  agent: string;
  created_at: string;
  variables?: unknown;
  controls?: unknown;
  expected_outcome?: string;
};
export type Run = {
  id: string;
  experiment_id: string;
  agent: string;
  status: string;
  progress?: number | null;
  task?: string;
  next_action?: string;
  configuration?: unknown;
  started_at: string;
  completed_at?: string;
  last_heartbeat_at?: string;
  stale?: boolean;
};
export type Observation = {
  id: string;
  run_id: string;
  metric_id?: string | null;
  value?: number | null;
  unit?: string;
  qualitative?: string;
  sample_size?: number | null;
  uncertainty?: string | null;
  evidence?: string | null;
  conditions_key?: string | null;
  created_at: string;
};
export type Analysis = {
  id: string;
  experiment_id: string;
  interpretation: string;
  comparison?: string;
  limitations?: string;
  uncertainty?: string;
  confounders?: string;
  conclusive?: boolean;
  agent: string;
  created_at: string;
};
export type Decision = {
  id: string;
  hypothesis_id?: string;
  experiment_id?: string;
  outcome: string;
  rationale: string;
  next_action: string;
  evidence_ids?: string[];
  agent: string;
  created_at: string;
};
export type Review = {
  id: string;
  proposed_action: string;
  rationale: string;
  evidence_ids?: string[];
  impact?: string;
  costs?: string;
  status: string;
  feedback?: string;
  requested_by: string;
  reviewed_by?: string | null;
  reviewer_name?: string | null;
  created_at: string;
};
export type ResearchEvent = {
  id: number;
  event_type: string;
  entity_id?: string;
  actor: string;
  description: string;
  payload: unknown;
  created_at: string;
};
export type Artifact = {
  id: string;
  run_id: string;
  type: string;
  url?: string;
  checksum?: string;
  version?: string;
  metadata?: unknown;
};
export type Snapshot = {
  campaign: Campaign;
  metrics: Metric[];
  hypotheses: Hypothesis[];
  experiments: Experiment[];
  runs: Run[];
  observations: Observation[];
  analyses: Analysis[];
  decisions: Decision[];
  reviews: Review[];
  events: ResearchEvent[];
  artifacts: Artifact[];
  summary: {
    active_experiments: number;
    completed_experiments: number;
    hypotheses_investigated: number;
    pending_reviews: number;
    latest_outcome?: unknown;
    best_result?: unknown;
    best_verified_result?: unknown;
    progress_percent?: number | null;
    target_gap?: number | null;
  };
};
export const words = (text: string | null | undefined) =>
  text?.replaceAll("_", " ") || "Not recorded";
export function date(value?: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? "Not recorded"
    : parsed.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}
export function numeric(value: unknown): string {
  const number =
    typeof value === "object" && value !== null && "value" in value
      ? Number(value.value)
      : typeof value === "number" || typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isFinite(number)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(
        number,
      )
    : "—";
}
