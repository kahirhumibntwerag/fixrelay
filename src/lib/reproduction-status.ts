export type EvidenceCounts = {
  reproducing_agent_count?: number;
  not_reproducing_agent_count?: number;
  reproduced_count?: number | null;
  not_reproduced_count?: number | null;
  unable_to_assess_count?: number | null;
  inconclusive_count?: number | null;
  technical_failure_count?: number | null;
};
export type CampaignEvidence = {
  reproducing_agents: number;
  fully_reproducing_agents: number;
  scope?: "public" | "accessible";
  status:
    | "unreviewed"
    | "reproduced"
    | "partial"
    | "mixed"
    | "not_reproduced"
    | "unresolved";
  experiments: number;
  completed: number;
  active: number;
  reproduced: number;
  challenged: number;
  unresolved: number;
  reports: number;
};
export function evidenceStatus(e: EvidenceCounts) {
  const yes = Number(e.reproduced_count || 0),
    no = Number(e.not_reproduced_count || 0),
    unresolved =
      Number(e.unable_to_assess_count || 0) +
      Number(e.inconclusive_count || 0) +
      Number(e.technical_failure_count || 0);
  return yes && no
    ? "mixed"
    : no
      ? "not_reproduced"
      : yes
        ? "reproduced"
        : unresolved
          ? "unresolved"
          : "unreviewed";
}
export function campaignEvidence(
  experiments: ({
    status: string;
    reproducing_agent_keys?: string[];
  } & EvidenceCounts)[],
): CampaignEvidence {
  const completed = experiments.filter((e) => e.status === "completed").length,
    active = experiments.filter((e) =>
      ["planned", "running"].includes(e.status),
    ).length;
  const reproduced = experiments.filter(
    (e) => e.status === "completed" && evidenceStatus(e) === "reproduced",
  ).length;
  const challenged = experiments.filter(
    (e) => Number(e.not_reproduced_count || 0) > 0,
  ).length;
  const positive = experiments.some((e) => Number(e.reproduced_count || 0) > 0);
  const unresolved = experiments.filter(
    (e) => evidenceStatus(e) === "unresolved",
  ).length;
  const reports = experiments.reduce(
    (n, e) =>
      n +
      Number(e.reproduced_count || 0) +
      Number(e.not_reproduced_count || 0) +
      Number(e.unable_to_assess_count || 0) +
      Number(e.inconclusive_count || 0) +
      Number(e.technical_failure_count || 0),
    0,
  );
  const status = challenged
    ? positive
      ? "mixed"
      : "not_reproduced"
    : completed > 0 && reproduced === completed && active === 0
      ? "reproduced"
      : reproduced > 0
        ? "partial"
        : reports > 0
          ? "unresolved"
          : "unreviewed";
  const keys = experiments.map((e) => new Set(e.reproducing_agent_keys || []));
  const allAgents = new Set(keys.flatMap((s) => [...s]));
  const completedKeys = experiments
    .filter((e) => e.status === "completed")
    .map((e) => new Set(e.reproducing_agent_keys || []));
  const fullAgents = completedKeys.length
    ? [...completedKeys[0]].filter((k) => completedKeys.every((s) => s.has(k)))
        .length
    : 0;
  return {
    reproducing_agents: allAgents.size,
    fully_reproducing_agents: fullAgents,
    status,
    experiments: experiments.length,
    completed,
    active,
    reproduced,
    challenged,
    unresolved,
    reports,
  };
}
export function agentReproductionLabel(e: EvidenceCounts) {
  const yes = e.reproducing_agent_count || 0,
    no = e.not_reproducing_agent_count || 0;
  if (yes)
    return `${yes} independent ${yes === 1 ? "agent reports" : "agents report"} reproducing this result${no ? `; ${no} ${no === 1 ? "agent reports" : "agents report"} not reproducing it` : ""}`;
  if (no)
    return `${no} ${no === 1 ? "agent reports" : "agents report"} not reproducing this result`;
  return evidenceStatus(e) === "unresolved"
    ? "Reproduction attempts could not assess this result"
    : "No agent reproduction reports yet";
}
