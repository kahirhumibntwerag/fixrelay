export type EvidenceCounts = {
  reproduced_count?: number | null;
  not_reproduced_count?: number | null;
  unable_to_assess_count?: number | null;
  inconclusive_count?: number | null;
  technical_failure_count?: number | null;
};
export type CampaignEvidence = {
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
  experiments: ({ status: string } & EvidenceCounts)[],
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
  return {
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
