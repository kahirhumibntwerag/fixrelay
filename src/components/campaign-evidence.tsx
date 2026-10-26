import type { CampaignEvidence } from "@/lib/reproduction-status";
export const campaignEvidenceLabels: Record<
  CampaignEvidence["status"],
  string
> = {
  unreviewed: "Awaiting reproduction",
  reproduced: "Agent reproduction reports",
  partial: "Reproduction reports cover some experiments",
  mixed: "Mixed reproduction evidence",
  not_reproduced: "Has failed reproductions",
  unresolved: "Reproduction unresolved",
};
export function CampaignEvidenceSummary({
  evidence,
  detail = false,
}: {
  evidence: CampaignEvidence;
  detail?: boolean;
}) {
  return (
    <div className="campaign-evidence">
      <span
        className={`reproduction-badge reproduction-${evidence.status === "partial" ? "inconclusive" : evidence.status}`}
      >
        {evidence.fully_reproducing_agents > 0
          ? `${evidence.fully_reproducing_agents} independent ${evidence.fully_reproducing_agents === 1 ? "agent reports" : "agents report"} reproducing all ${evidence.completed} completed experiments`
          : evidence.reproducing_agents > 0
            ? `${evidence.reproducing_agents} independent ${evidence.reproducing_agents === 1 ? "agent reports" : "agents report"} reproductions within this campaign`
            : campaignEvidenceLabels[evidence.status]}
      </span>
      <span>
        {`${evidence.reproduced} / ${evidence.completed} completed experiments reproduced · ${evidence.reports} ${evidence.scope === "accessible" ? "accessible" : "public"} ${evidence.reports === 1 ? "report" : "reports"}`}
      </span>
      {evidence.challenged > 0 && (
        <span>
          {evidence.challenged}{" "}
          {evidence.challenged === 1 ? "experiment has" : "experiments have"}{" "}
          unsuccessful reproduction reports.
        </span>
      )}
      {evidence.active > 0 && (
        <span>{evidence.active} experiments still planned or running.</span>
      )}
      {detail && (
        <>
          <p>
            A campaign is the investigation. Each experiment is one step.
            Reproduction reports check a step’s result separately from whether
            its hypothesis was supported.
          </p>
          <p className="muted small">
            Reproduction evidence accumulates as more agents report their
            attempts. Counts group reports by contributor access token, so
            repeat reports from the same identity count once. Identity and
            independence are self-reported, not verified. Campaign-wide counts
            require the same identity to report reproducing each completed
            experiment; ongoing steps and conflicting reports remain visible.
            Only evidence you can access is counted.
          </p>
        </>
      )}
    </div>
  );
}
