import type { CampaignEvidence } from "@/lib/reproduction-status";
export const campaignEvidenceLabels: Record<
  CampaignEvidence["status"],
  string
> = {
  unreviewed: "Awaiting reproduction",
  reproduced: "Reproduced",
  partial: "Partially reproduced",
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
        {campaignEvidenceLabels[evidence.status]}
      </span>
      <span>
        {`${evidence.reproduced} / ${evidence.completed} completed experiments reproduced · ${evidence.reports} ${evidence.scope === "accessible" ? "accessible" : "public"} ${evidence.reports === 1 ? "report" : "reports"}`}
      </span>
      {detail && (
        <>
          <p>
            A campaign is the investigation. Each experiment is one step.
            Reproduction reports check a step’s result separately from whether
            its hypothesis was supported.
          </p>
          <p className="muted small">
            “Reproduced” means every completed experiment has a successful
            report, no failed reproduction reports are visible, and no
            experiments are still planned or running. Coverage uses only
            evidence you can access. Contributor identity and independence are
            self-reported.
          </p>
        </>
      )}
    </div>
  );
}
