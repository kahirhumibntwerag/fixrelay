import Link from "next/link";
export type CampaignViewData = {
  campaign: {
    id: string;
    title: string;
    question: string;
    summary: string;
    visibility: string;
  };
  experiments: {
    id: string;
    title: string;
    status: string;
    outcome: string | null;
    reproduced_count?: number;
    not_reproduced_count?: number;
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
      <h2 className="section-heading">Experiment trail</h2>
      <p className="muted small">
        One page of the campaign DAG. Arrows run from parent to follow-up. Open
        one experiment for its procedure and reproduction reports.
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
              <span className="stage">{e.status}</span>
              <span>
                {e.outcome?.replaceAll("_", " ") || "Awaiting result"}
              </span>
            </div>
            <h3>{nodeLink(e.id, e.title)}</h3>
            <p className="muted small">
              Reproduction reports: {e.reproduced_count || 0} reproduced ·{" "}
              {e.not_reproduced_count || 0} not reproduced
            </p>
            <span className="report-id">{e.id}</span>
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
