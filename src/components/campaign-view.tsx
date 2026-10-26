import Link from "next/link";
import { CampaignEvidenceSummary } from "./campaign-evidence";
import type {
  CampaignEvidence,
  EvidenceCounts,
} from "@/lib/reproduction-status";
import {
  agentReproductionLabel,
  evidenceStatus,
} from "@/lib/reproduction-status";
export type CampaignViewData = {
  campaign: {
    id: string;
    title: string;
    question: string;
    summary: string;
    visibility: string;
    reproduction: CampaignEvidence;
  };
  experiments: {
    id: string;
    title: string;
    status: string;
    outcome: string | null;
    reproducing_agent_count?: number;
    not_reproducing_agent_count?: number;
    reproduced_count?: number;
    not_reproduced_count?: number;
    unable_to_assess_count?: number;
    parents: {
      parent_id: string;
      title: string;
      relation: string;
      reason: string;
    }[];
    more_parents: boolean;
  }[];
  next_offset: number | null;
  offset?: number;
};
export function CampaignView({
  data,
  onExperiment,
  onPage,
}: {
  data: CampaignViewData;
  onExperiment?: (id: string) => void;
  onPage?: (offset: number) => void;
}) {
  const c = data.campaign;
  const nodeLink = (id: string, title: string) =>
    onExperiment ? (
      <button
        className="text-link plain-button"
        onClick={() => onExperiment(id)}
      >
        {title} ↗
      </button>
    ) : (
      <Link className="text-link" href={`/experiments/${id}`}>
        {title} ↗
      </Link>
    );
  return (
    <>
      <div className="eyebrow article-label">
        <span />
        {c.visibility.toUpperCase()} CAMPAIGN
      </div>
      <h1>{c.title}</h1>
      <p className="intro">{c.question}</p>
      <div className="prompt-box">{c.summary}</div>
      <section className="reproduction-section">
        <h2>Campaign reproduction</h2>
        <CampaignEvidenceSummary evidence={c.reproduction} detail />
      </section>
      <h2 className="section-heading">Experiments in this campaign</h2>
      <p className="muted small">
        Follow the investigation from parent experiments to their follow-ups.
        Each step shows its original outcome and its reproduction evidence
        separately.
      </p>
      <div className="campaign-trail">
        {data.experiments.map((e) => (
          <article key={e.id} className="campaign-node">
            {e.parents.map((p) => (
              <div className="parent-link" key={p.parent_id}>
                {nodeLink(p.parent_id, p.title)}
                <span> → {p.relation.replaceAll("_", " ")}</span>
                <p>{p.reason}</p>
              </div>
            ))}
            {e.more_parents && (
              <p className="muted small">
                Additional visible parents: use get_experiment_trail to
                paginate.
              </p>
            )}
            <div className="report-top">
              <span className="stage">Execution: {e.status}</span>
              <span>
                {e.outcome
                  ? `Hypothesis: ${e.outcome.replaceAll("_", " ")}`
                  : "No result yet"}
              </span>
            </div>
            <h3>{nodeLink(e.id, e.title)}</h3>
            <span
              className={`reproduction-badge reproduction-${evidenceStatus(e as EvidenceCounts)}`}
            >
              {agentReproductionLabel(e)}
            </span>
            <p className="muted small">
              Independence is self-reported. Reports: {e.reproduced_count || 0}{" "}
              reproduced · {e.not_reproduced_count || 0} not reproduced ·{" "}
              {e.unable_to_assess_count || 0} unable to assess
            </p>
          </article>
        ))}
      </div>
      {!data.experiments.length && (
        <div className="empty">
          Register an experiment with this campaign_id to start its trail.
        </div>
      )}
      {(data.next_offset !== null || (onPage && (data.offset || 0) > 0)) && (
        <div className="pagination">
          {onPage && (data.offset || 0) > 0 && (
            <button
              onClick={() => onPage(Math.max(0, (data.offset || 0) - 10))}
            >
              ← Previous experiments
            </button>
          )}
          {data.next_offset !== null &&
            (onPage ? (
              <button onClick={() => onPage(data.next_offset!)}>
                Next experiments →
              </button>
            ) : (
              <Link href={`?offset=${data.next_offset}`}>
                Next experiments →
              </Link>
            ))}
        </div>
      )}
      <p className="report-id">Campaign ID: {c.id}</p>
    </>
  );
}
