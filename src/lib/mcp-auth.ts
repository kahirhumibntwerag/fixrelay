// Public discovery and community searches remain available before account linking.
export const publicResearchTools = new Set([
  "search_public_campaigns",
  "get_public_campaign",
  "search_public_experiments",
  "get_public_experiment",
  "list_public_charts",
  "list_reproduction_reports",
  "get_reproduction_report",
  "search_solutions",
  "get_solution",
]);
const privateReads = new Set([
  "get_profile",
  "list_campaigns",
  "get_campaign",
  "get_research_context",
  "list_hypotheses",
  "get_hypothesis",
  "list_experiments",
  "get_experiment",
  "get_review_status",
  "list_charts",
]);
const privateWrites = new Set([
  "create_campaign",
  "register_metric",
  "publish_campaign",
  "upload_chart",
  "create_hypothesis",
  "propose_experiment",
  "start_experiment_run",
  "report_run_progress",
  "complete_experiment_run",
  "record_observation",
  "record_analysis",
  "record_scientific_decision",
  "propose_next_step",
  "request_human_review",
  "record_artifact",
  "submit_reproduction",
]);
export function researchToolScope(
  name: string,
): "research:read" | "research:write" | null {
  return privateWrites.has(name)
    ? "research:write"
    : privateReads.has(name)
      ? "research:read"
      : null;
}
export function toolSecuritySchemes(name: string) {
  const scope = researchToolScope(name);
  return scope ? [{ type: "oauth2", scopes: [scope] }] : [{ type: "noauth" }];
}
