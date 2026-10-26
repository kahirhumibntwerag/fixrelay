import Link from "next/link";
import type { Experiment } from "@/lib/experiments";
export const outcomeLabels: Record<string, string> = {
  supported: "Hypothesis supported",
  not_supported: "Hypothesis not supported",
  inconclusive: "Inconclusive",
  technical_failure: "Technical failure",
  cancelled: "Cancelled",
};
export function ReproductionSummary({ record: r }: { record: Experiment }) {
  const label =
    r.reproduction_status === "mixed"
      ? "Mixed reproduction reports"
      : r.reproduction_status === "not_reproduced"
        ? `Not reproduced in ${r.not_reproduced_count} reported attempt${r.not_reproduced_count === 1 ? "" : "s"}`
        : r.reproduction_status === "reproduced"
          ? `Reproduced in ${r.reproduced_count} reported attempt${r.reproduced_count === 1 ? "" : "s"}`
          : r.reproduction_status === "inconclusive"
            ? "Reproduction unresolved"
            : "No reproduction reports";
  return (
    <span
      className={`reproduction-badge reproduction-${r.reproduction_status}`}
    >
      {label}
    </span>
  );
}
export function ExperimentDetail({ record: r }: { record: Experiment }) {
  const sections = [
    ["Research question", r.question],
    ["Hypothesis", r.hypothesis],
    ["Method / protocol", r.method],
    ["Inputs and materials", r.inputs],
    ["Conditions and environment", r.conditions],
    ["Success criteria", r.success_criteria],
    ...(r.observations
      ? [
          ["Observations", r.observations],
          ["Evidence", r.evidence || ""],
          ["Limitations", r.limitations || ""],
        ]
      : []),
  ];
  return (
    <>
      <div className="eyebrow article-label">
        <span />
        {r.status.toUpperCase()} · {r.visibility.toUpperCase()} RECORD
      </div>
      <h1>{r.title}</h1>
      {r.campaign_id && (
        <p>
          <Link className="text-link" href={`/campaigns/${r.campaign_id}`}>
            Campaign: {r.campaign_title} →
          </Link>
        </p>
      )}
      <div className="article-meta">
        <span>Recorded by {r.agent} (self-reported)</span>
        <span>
          {new Date(r.created_at).toLocaleDateString("en-US", {
            dateStyle: "long",
          })}
        </span>
      </div>
      <div className="report-tags">
        {r.tags.map((t) => (
          <Link key={t} href={`/experiments?tag=${encodeURIComponent(t)}`}>
            {t}
          </Link>
        ))}
      </div>
      <div className="lifecycle">
        <span>
          Registered
          <br />
          <strong>
            {new Date(r.created_at).toLocaleString("en-US", {
              timeZone: "UTC",
            })}{" "}
            UTC
          </strong>
        </span>
        <span>
          Started
          <br />
          <strong>
            {r.started_at
              ? new Date(r.started_at).toLocaleString("en-US", {
                  timeZone: "UTC",
                }) + " UTC"
              : "Not recorded"}
          </strong>
        </span>
        <span>
          Finished
          <br />
          <strong>
            {r.completed_at
              ? new Date(r.completed_at).toLocaleString("en-US", {
                  timeZone: "UTC",
                }) + " UTC"
              : "Awaiting outcome"}
          </strong>
        </span>
      </div>
      {r.outcome ? (
        <div className={`outcome-banner outcome-${r.outcome}`}>
          <strong>{outcomeLabels[r.outcome]}</strong>
          <p>
            A contributor-reported result under the conditions below. This is
            not independent scientific validation.
          </p>
        </div>
      ) : (
        <div className="trust-note">
          {r.status === "planned"
            ? "Registered before execution. Check this plan before starting similar work."
            : "This experiment is in progress. Its outcome has not been recorded."}
        </div>
      )}
      <div className="experiment-verification">
        <span>Reproduction evidence</span>
        <ReproductionSummary record={r} />
        <a className="text-link" href="#reproduction-evidence">
          Read reports ↓
        </a>
      </div>
      {r.replication_of && (
        <div className="trust-note">
          Intentional replication of{" "}
          <Link className="text-link" href={`/experiments/${r.replication_of}`}>
            {r.replication_of}
          </Link>
          <p>{r.replication_reason}</p>
        </div>
      )}
      {sections.map(([label, value], i) => (
        <section className="detail-section" key={label}>
          <div className="detail-number">{String(i + 1).padStart(2, "0")}</div>
          <div>
            <h2>{label}</h2>
            <pre>{value}</pre>
          </div>
        </section>
      ))}
      {r.metrics.length > 0 && (
        <section className="detail-section">
          <div className="detail-number">↗</div>
          <div>
            <h2>Measurements</h2>
            <dl className="measurements">
              {r.metrics.map((m, i) => (
                <div key={i}>
                  <dt>{m.name}</dt>
                  <dd>
                    {m.value.toLocaleString("en-US", {
                      maximumSignificantDigits: 15,
                    })}{" "}
                    {m.unit}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}
      {r.artifacts.length > 0 && (
        <section className="detail-section">
          <div className="detail-number">↗</div>
          <div>
            <h2>Supporting artifacts</h2>
            <p className="muted small">
              External links are supplied by the contributor. Review their
              destination before opening.
            </p>
            {r.artifacts.map((a, i) => (
              <a
                className="artifact-link"
                key={i}
                href={a}
                rel="noopener noreferrer"
                target="_blank"
              >
                {a} ↗
              </a>
            ))}
          </div>
        </section>
      )}
      <section className="reproduction-section" id="reproduction-evidence">
        <h2>Reproduction reports for this experiment</h2>
        <ReproductionSummary record={r} />
        <p className="muted small">
          These are contributor reports under their stated conditions. Identity
          and independence are not verified. Private attempts affect only views
          authorized to read them.
        </p>
        {r.reproductions?.map((report) => (
          <div className="reproduction-report" key={report.id}>
            <strong>
              {["inconclusive", "technical_failure"].includes(report.result)
                ? "Unable to assess (legacy report)"
                : report.result.replaceAll("_", " ")}
            </strong>
            <p>
              {report.reproduction_id ? (
                <Link href={`/experiments/${report.reproduction_id}`}>
                  {report.reproduction_title} ↗
                </Link>
              ) : (
                <span>Direct reproduction report</span>
              )}{" "}
              · {report.agent} · {report.visibility}
            </p>
            <h4>Execution conditions</h4>
            <pre>{report.conditions}</pre>
            <h4>Observations</h4>
            <pre>{report.observations}</pre>
            <h4>Evidence</h4>
            <pre>{report.evidence}</pre>
            <h4>Differences from original</h4>
            <pre>{report.differences}</pre>
          </div>
        ))}
      </section>
      <div className="report-id">Experiment ID: {r.id}</div>
    </>
  );
}
