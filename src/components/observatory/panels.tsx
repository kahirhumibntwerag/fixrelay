"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  FlaskConical,
  GitBranch,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  date,
  numeric,
  words,
  type Experiment,
  type Hypothesis,
  type Observation,
  type Snapshot,
} from "./types";

export function Badge({ status }: { status?: string | null }) {
  return (
    <span className={`obs-badge obs-status-${status || "untested"}`}>
      {words(status)}
    </span>
  );
}
function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="obs-panel-empty">
      <FlaskConical size={25} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function DataText({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return children ? (
    <div className="obs-data-text">
      <span>{label}</span>
      <p>{children}</p>
    </div>
  ) : null;
}
function EvidenceLinks({ ids, data }: { ids?: string[]; data: Snapshot }) {
  return ids?.length ? (
    <div className="obs-evidence-links">
      <span>Underlying evidence</span>
      {ids.map((id) => {
        const observation = data.observations.find((item) => item.id === id),
          analysis = data.analyses.find((item) => item.id === id);
        return (
          <details key={id} className="obs-evidence-reference">
            <summary>
              {observation
                ? `${data.metrics.find((metric) => metric.id === observation.metric_id)?.name || "Observation"}: ${observation.value == null ? "qualitative" : numeric(observation.value)} ${observation.unit || ""}`
                : analysis
                  ? "Supporting analysis"
                  : `Evidence ${id.slice(0, 8)}`}
            </summary>
            {observation ? (
              <>
                <DataText label="Observation">
                  {observation.qualitative}
                </DataText>
                <DataText label="Evidence reference">
                  {observation.evidence || "No artifact reference recorded."}
                </DataText>
                <DataText label="Uncertainty">
                  {observation.uncertainty || "Not reported"}
                </DataText>
                <small>
                  Sample size: {observation.sample_size ?? "not reported"} ·{" "}
                  {date(observation.created_at)}
                </small>
              </>
            ) : analysis ? (
              <>
                <p>{analysis.interpretation}</p>
                <DataText label="Limitations">{analysis.limitations}</DataText>
              </>
            ) : (
              <p>
                The full evidence record is outside this bounded snapshot.
                Retrieve it through the campaign context tools.
              </p>
            )}
            <small>
              Record ID: <code>{id}</code>
            </small>
          </details>
        );
      })}
    </div>
  ) : (
    <p className="obs-muted">No evidence references recorded.</p>
  );
}

export function OverviewPanel({
  data,
  onNavigate,
  onUpdated,
  onInspectExperiment,
}: {
  data: Snapshot;
  onUpdated: () => void;
  onInspectExperiment: (id: string) => void;
  onNavigate: (
    tab: "overview" | "hypotheses" | "experiments" | "activity" | "review",
  ) => void;
}) {
  const metric = data.metrics[0],
    active = data.runs.filter((run) => run.status === "running"),
    latestDecisions = data.decisions.slice(-3).reverse();
  const failed = data.runs.filter((run) => run.status === "failed"),
    stale = active.filter((run) => run.stale);
  const pending = data.reviews.filter((review) => review.status === "pending");
  const hasAttention = pending.length + failed.length + stale.length > 0;
  return (
    <div className="obs-overview">
      <section className="obs-card obs-objective">
        <div className="obs-card-heading">
          <div className="obs-eyebrow">THE RESEARCH QUESTION</div>
          <div className="obs-inline">
            <span className="obs-private">{data.campaign.visibility}</span>
            <Badge status={data.campaign.status || "active"} />
          </div>
        </div>
        <h2>{data.campaign.question}</h2>
        <p>{data.campaign.objective || data.campaign.summary}</p>
        {metric ? (
          <>
            <div className="obs-objective-metrics">
              <div>
                <span>PRIMARY METRIC</span>
                <strong>
                  {metric.name}
                  <small>{metric.unit}</small>
                </strong>
              </div>
              <div>
                <span>BASELINE</span>
                <strong>
                  {numeric(metric.baseline)}
                  <small>{metric.unit}</small>
                </strong>
              </div>
              <div>
                <span>TARGET · {words(metric.direction).toUpperCase()}</span>
                <strong>
                  {numeric(metric.target)}
                  {metric.direction === "range"
                    ? ` – ${numeric(metric.target_max)}`
                    : ""}
                  <small>{metric.unit}</small>
                </strong>
              </div>
              <div>
                <span>BEST REPRODUCED RESULT</span>
                <strong>
                  {numeric(data.summary.best_verified_result)}
                  <small>{metric.unit}</small>
                </strong>
              </div>
            </div>
            <p className="obs-evidence-note">
              Reproduction evidence and agent independence are self-reported.
              This is not formal peer review.
            </p>
            {data.summary.progress_percent != null &&
            Number.isFinite(Number(data.summary.progress_percent)) ? (
              <div className="obs-objective-progress">
                <div>
                  <span>Progress from agent-reported results</span>
                  <strong>{numeric(data.summary.progress_percent)}%</strong>
                </div>
                <progress
                  max={100}
                  value={Math.max(
                    0,
                    Math.min(100, Number(data.summary.progress_percent)),
                  )}
                />
                <small>
                  Based on comparable evidence. Metric improvement alone does
                  not confirm a hypothesis.
                </small>
              </div>
            ) : (
              <p className="obs-muted">
                {data.summary.target_gap != null
                  ? `Target gap: ${numeric(data.summary.target_gap)} ${metric.unit || ""}. `
                  : ""}
                A meaningful progress percentage is not yet available.
              </p>
            )}
            <details className="obs-details">
              <summary>Evaluation methodology and boundaries</summary>
              <DataText label="Evaluation protocol">
                {metric.evaluation_protocol}
              </DataText>
              <DataText label="Constraints">
                {data.campaign.constraints || "No constraints recorded."}
              </DataText>
              <DataText label="Stopping conditions">
                {data.campaign.stop_conditions ||
                  "No stopping conditions recorded."}
              </DataText>
            </details>
          </>
        ) : (
          <p className="obs-muted">
            No primary metric has been registered for this campaign.
          </p>
        )}
      </section>
      <div className="obs-stats">
        {[
          {
            label: "Active experiments",
            value: data.summary.active_experiments,
            icon: Activity,
          },
          {
            label: "Completed experiments",
            value: data.summary.completed_experiments,
            icon: FlaskConical,
          },
          {
            label: "Hypotheses investigated",
            value: data.summary.hypotheses_investigated,
            icon: GitBranch,
          },
          {
            label: "Pending human decisions",
            value: data.summary.pending_reviews,
            icon: ShieldCheck,
          },
        ].map((stat) => (
          <div className="obs-stat" key={stat.label}>
            <div>
              <span>{stat.label}</span>
              <stat.icon size={17} />
            </div>
            <strong>{stat.value ?? 0}</strong>
          </div>
        ))}
      </div>
      <div className="obs-two-columns">
        <section className="obs-card">
          <div className="obs-card-heading">
            <h2>Current agent activity</h2>
            <span className="obs-subtle-label">REPORTED BY AGENTS</span>
          </div>
          {active.length ? (
            active.slice(0, 4).map((run) => (
              <div className="obs-active-run" key={run.id}>
                <div className="obs-inline">
                  <strong>{run.agent}</strong>
                  <Badge status={run.stale ? "stale" : run.status} />
                </div>
                <h3>
                  {data.experiments.find(
                    (experiment) => experiment.id === run.experiment_id,
                  )?.title || "Experiment"}
                </h3>
                <p>
                  {run.task || "Run in progress; no task description reported."}
                </p>
                {run.progress != null && (
                  <div className="obs-run-progress">
                    <progress
                      max={100}
                      value={Math.max(0, Math.min(100, Number(run.progress)))}
                    />
                    <span>{numeric(run.progress)}%</span>
                  </div>
                )}
                <small>
                  Last heartbeat ·{" "}
                  {date(run.last_heartbeat_at || run.started_at)}
                </small>
                {run.next_action && (
                  <div className="obs-next-action">
                    <ArrowRight size={14} />
                    {run.next_action}
                  </div>
                )}
              </div>
            ))
          ) : (
            <Empty title="No active runs">
              Agents report activity when a run starts. Connect an agent to
              continue this campaign.
            </Empty>
          )}
        </section>
        <section className="obs-card">
          <div className="obs-card-heading">
            <h2>Attention required</h2>
            {hasAttention && (
              <TriangleAlert size={17} className="obs-warning" />
            )}
          </div>
          {hasAttention ? (
            <div className="obs-attention-list">
              {pending.map((review) => (
                <button key={review.id} onClick={() => onNavigate("review")}>
                  <ShieldCheck size={17} />
                  <span>
                    <strong>Researcher approval requested</strong>
                    <small>{review.proposed_action}</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
              {stale.map((run) => (
                <div key={run.id}>
                  <Clock3 size={17} />
                  <span>
                    <strong>{run.agent} has stopped reporting</strong>
                    <small>
                      Heartbeat stale. The experiment has not been marked
                      failed.
                    </small>
                  </span>
                </div>
              ))}
              {failed.slice(0, 3).map((run) => (
                <button key={run.id} onClick={() => onNavigate("experiments")}>
                  <TriangleAlert size={17} />
                  <span>
                    <strong>Run needs investigation</strong>
                    <small>
                      {data.experiments.find(
                        (experiment) => experiment.id === run.experiment_id,
                      )?.title || run.id}
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          ) : (
            <div className="obs-clear">
              <div>
                <Check size={21} />
              </div>
              <h3>No outstanding attention items</h3>
              <p>
                Review requests, technical failures, and stale agent activity
                appear here.
              </p>
            </div>
          )}
        </section>
      </div>
      <MetricTrend data={data} onInspectExperiment={onInspectExperiment} />
      <section className="obs-card">
        <div className="obs-card-heading">
          <h2>Recent scientific findings</h2>
          <button
            className="obs-link-button"
            onClick={() => onNavigate("activity")}
          >
            View activity <ArrowRight size={14} />
          </button>
        </div>
        {latestDecisions.length ? (
          <div className="obs-findings">
            {latestDecisions.map((decision) => (
              <article key={decision.id}>
                <div className="obs-inline">
                  <Badge status={decision.outcome} />
                  <span className="obs-subtle-label">AGENT INTERPRETATION</span>
                </div>
                <h3>
                  {data.hypotheses.find(
                    (hypothesis) => hypothesis.id === decision.hypothesis_id,
                  )?.title || "Scientific decision"}
                </h3>
                <p>{decision.rationale}</p>
                <EvidenceLinks ids={decision.evidence_ids} data={data} />
                <div className="obs-next-action">
                  <ArrowRight size={14} />
                  {words(decision.next_action)}
                </div>
                <small>
                  {decision.agent} · {date(decision.created_at)}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="The evidence trail starts here">
            As agents analyze results, their supported, contradicted, and
            inconclusive findings will appear here.
          </Empty>
        )}
      </section>
      <SharingPanel data={data} onUpdated={onUpdated} />
    </div>
  );
}

function SharingPanel({
  data,
  onUpdated,
}: {
  data: Snapshot;
  onUpdated: () => void;
}) {
  const completed = data.experiments.filter(
    (experiment) => experiment.status === "completed",
  );
  const [selected, setSelected] = useState<string[]>([]),
    [acknowledged, setAcknowledged] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  const [attempt, setAttempt] = useState({ payload: "", key: "" });
  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess(false);
    const input = { campaign_id: data.campaign.id, experiment_ids: selected },
      payload = JSON.stringify(input);
    const key = attempt.payload === payload ? attempt.key : crypto.randomUUID();
    setAttempt({ payload, key });
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish_campaign",
          input,
          idempotency_key: key,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to publish findings.");
      setSuccess(true);
      setSelected([]);
      setAcknowledged(false);
      onUpdated();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to publish findings.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="obs-card">
      <details>
        <summary className="obs-share-heading">
          <span>
            <ShieldCheck size={18} />
            Share findings with the research community
          </span>
          <span className="obs-subtle-label">DELIBERATE PUBLICATION</span>
        </summary>
        <p className="obs-muted">
          Publish selected completed experiments to RogNet’s shared registry.
          Their experimental design, observations, evidence, limitations, and
          campaign summary become publicly readable. Run configurations and the
          internal activity trail remain private.
        </p>
        <p className="obs-muted">
          Review every selected record for private data, credentials,
          unpublished work, and third-party restrictions before publishing.
        </p>
        {completed.length ? (
          <form onSubmit={publish}>
            <div className="obs-share-list">
              {completed.map((experiment) => (
                <label key={experiment.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(experiment.id)}
                    onChange={(event) => {
                      setSuccess(false);
                      setSelected((items) =>
                        event.target.checked
                          ? [...items, experiment.id]
                          : items.filter((id) => id !== experiment.id),
                      );
                    }}
                  />
                  <span>
                    {experiment.title}
                    <small>
                      {words(experiment.outcome || experiment.status)}
                    </small>
                  </span>
                  <span className="obs-subtle-label">COMPLETED</span>
                </label>
              ))}
            </div>
            <label className="obs-share-acknowledgement">
              <input
                type="checkbox"
                required
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>
                I reviewed these findings and approve publishing the selected
                records and campaign summary publicly.
              </span>
            </label>
            {error && (
              <p className="obs-form-error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="obs-publish-success" role="status">
                Selected findings are public.{" "}
                <Link href={`/campaigns/${data.campaign.id}`}>
                  View shared campaign <ArrowUpRight size={13} />
                </Link>
              </p>
            )}
            <div className="obs-form-actions">
              <span className="obs-muted">
                {selected.length} experiments selected
              </span>
              <button
                className="obs-button obs-primary"
                disabled={busy || !selected.length || !acknowledged}
              >
                {busy ? "Publishing…" : "Publish selected findings"}
                <ArrowUpRight size={14} />
              </button>
            </div>
          </form>
        ) : (
          <p className="obs-muted">
            Completed experiments become eligible for publication here.
          </p>
        )}
      </details>
    </section>
  );
}

function MetricTrend({
  data,
  onInspectExperiment,
}: {
  data: Snapshot;
  onInspectExperiment: (id: string) => void;
}) {
  const metric = data.metrics[0];
  const observations = useMemo(
    () =>
      data.observations.filter(
        (observation) =>
          observation.metric_id === metric?.id &&
          observation.value != null &&
          observation.unit === metric?.unit &&
          observation.conditions_key === metric?.evaluation_protocol &&
          data.runs.some(
            (run) =>
              run.id === observation.run_id && run.status === "completed",
          ),
      ),
    [data, metric?.id],
  );
  const conditions = [
    ...new Set(observations.map((observation) => observation.conditions_key!)),
  ];
  const [selected, setSelected] = useState("");
  const condition = conditions.includes(selected) ? selected : conditions[0];
  const points = observations
    .filter((observation) => observation.conditions_key === condition)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const values = points.map((observation) => Number(observation.value));
  if (metric?.baseline != null) values.push(Number(metric.baseline));
  if (metric) values.push(Number(metric.target));
  const low = Math.min(...values),
    high = Math.max(...values),
    padding = Math.max((high - low) * 0.18, Math.abs(high) * 0.02, 0.01);
  const y = (value: number) =>
    160 - ((value - low + padding) / (high - low + 2 * padding)) * 130;
  const x = (index: number) =>
    55 + index * (650 / Math.max(points.length - 1, 1));
  return (
    <section className="obs-card">
      <div className="obs-card-heading">
        <div>
          <h2>Evidence trend</h2>
          <p className="obs-muted">
            {metric
              ? `${metric.name} · ${metric.unit || "unitless"} · completed runs with matching evaluation conditions`
              : "Comparable measurements over time"}
          </p>
        </div>
        {conditions.length > 1 && (
          <label className="obs-inline-label">
            Conditions
            <select
              value={condition}
              onChange={(event) => setSelected(event.target.value)}
            >
              {conditions.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {metric && points.length > 0 ? (
        <>
          <div
            className="obs-chart"
            role="img"
            aria-label={`${metric.name} over ${points.length} comparable observations. Baseline ${metric.baseline ?? "unavailable"}; target ${metric.target}.`}
          >
            <svg viewBox="0 0 800 200">
              <line x1="50" x2="720" y1="170" y2="170" stroke="#333b43" />
              {metric.baseline != null && (
                <g>
                  <line
                    x1="50"
                    x2="720"
                    y1={y(Number(metric.baseline))}
                    y2={y(Number(metric.baseline))}
                    stroke="#84909c"
                    strokeDasharray="5 5"
                  />
                  <text
                    x="730"
                    y={y(Number(metric.baseline)) + 4}
                    fill="#99a1ab"
                    fontSize="11"
                  >
                    Baseline
                  </text>
                </g>
              )}
              <g>
                <line
                  x1="50"
                  x2="720"
                  y1={y(Number(metric.target))}
                  y2={y(Number(metric.target))}
                  stroke="#b5ed83"
                  strokeDasharray="5 5"
                />
                <text
                  x="730"
                  y={y(Number(metric.target)) + 4}
                  fill="#b5ed83"
                  fontSize="11"
                >
                  Target
                </text>
              </g>
              <polyline
                points={points
                  .map(
                    (point, index) => `${x(index)},${y(Number(point.value))}`,
                  )
                  .join(" ")}
                fill="none"
                stroke="#b5ed83"
                strokeWidth="2.5"
              />
              {points.map((point, index) => (
                <g key={point.id}>
                  <circle
                    cx={x(index)}
                    cy={y(Number(point.value))}
                    r="4"
                    fill="#b5ed83"
                  />
                  <text
                    x={x(index)}
                    y={y(Number(point.value)) - 12}
                    textAnchor="middle"
                    fill="#eef0f2"
                    fontSize="12"
                  >
                    {numeric(point.value)}
                  </text>
                  <text
                    x={x(index)}
                    y="190"
                    textAnchor="middle"
                    fill="#87919b"
                    fontSize="10"
                  >
                    {index + 1}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <p className="obs-chart-note">
            Evaluation conditions: <code>{condition}</code>. Different
            conditions are shown as separate series; they do not establish a
            fair comparison.
          </p>
          <div className="obs-evidence-table">
            <table>
              <caption className="obs-sr-only">
                Comparable completed measurements
              </caption>
              <thead>
                <tr>
                  <th>Measurement</th>
                  <th>Experiment</th>
                  <th>Sample size</th>
                  <th>Uncertainty</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => {
                  const run = data.runs.find(
                    (item) => item.id === point.run_id,
                  );
                  return (
                    <tr key={point.id}>
                      <td>
                        <button
                          className="obs-link-button"
                          onClick={() =>
                            run && onInspectExperiment(run.experiment_id)
                          }
                        >
                          {numeric(point.value)} {point.unit || metric.unit}
                        </button>
                      </td>
                      <td>
                        {data.experiments.find(
                          (item) => item.id === run?.experiment_id,
                        )?.title || "—"}
                      </td>
                      <td>{point.sample_size ?? "Not reported"}</td>
                      <td>{point.uncertainty || "Not reported"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Empty title="Comparable evidence will appear here">
          Record a numerical observation with a metric definition and an
          evaluation conditions key matching the registered evaluation protocol,
          then complete its run. Unmatched or incomplete measurements remain
          available in experiment details.
        </Empty>
      )}
    </section>
  );
}

export function HypothesisPanel({ data }: { data: Snapshot }) {
  const [selectedId, setSelectedId] = useState("");
  const selected = data.hypotheses.find(
    (hypothesis) => hypothesis.id === selectedId,
  );
  if (!data.hypotheses.length)
    return (
      <section className="obs-card">
        <Empty title="A hypothesis gives the experiment a purpose">
          Your agent can propose testable statements, register predictions, and
          branch into follow-up questions through MCP.
        </Empty>
        <Link href="/settings" className="obs-text-link">
          Connect your research agent <ArrowUpRight size={14} />
        </Link>
      </section>
    );
  const depth = (hypothesis: Hypothesis, seen = new Set<string>()): number => {
    if (!hypothesis.parent_hypothesis_id || seen.has(hypothesis.id)) return 0;
    seen.add(hypothesis.id);
    const parent = data.hypotheses.find(
      (item) => item.id === hypothesis.parent_hypothesis_id,
    );
    return parent ? 1 + depth(parent, seen) : 0;
  };
  const rows: Record<number, number> = {};
  const positions = data.hypotheses.map((hypothesis) => {
    const column = depth(hypothesis);
    const row = rows[column] || 0;
    rows[column] = row + 1;
    return { hypothesis, x: column * 280 + 25, y: row * 118 + 25 };
  });
  const width = Math.max(...positions.map((position) => position.x)) + 270,
    height = Math.max(...positions.map((position) => position.y)) + 120;
  return (
    <div className="obs-hypothesis-layout">
      <section className="obs-card">
        <div className="obs-card-heading">
          <div>
            <h2>How the question evolves</h2>
            <p className="obs-muted">
              Select a hypothesis to inspect its prediction and evidence.
            </p>
          </div>
          <span className="obs-subtle-label">
            {data.hypotheses.length} HYPOTHESES
          </span>
        </div>
        <div className="obs-graph-scroll">
          <div className="obs-graph" style={{ width, height }}>
            <svg width={width} height={height} aria-hidden="true">
              <defs>
                <marker
                  id="hypothesis-arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0 0 L8 4 L0 8" fill="none" stroke="#65715f" />
                </marker>
              </defs>
              {positions.map((position) => {
                const parent = positions.find(
                  (item) =>
                    item.hypothesis.id ===
                    position.hypothesis.parent_hypothesis_id,
                );
                if (!parent) return null;
                return (
                  <g key={position.hypothesis.id}>
                    <path
                      d={`M${parent.x + 235},${parent.y + 38} C${parent.x + 260},${parent.y + 38} ${position.x - 25},${position.y + 38} ${position.x},${position.y + 38}`}
                      fill="none"
                      stroke="#65715f"
                      markerEnd="url(#hypothesis-arrow)"
                    />
                    <title>
                      {words(
                        position.hypothesis.relationship || "derived_from",
                      )}
                    </title>
                  </g>
                );
              })}
            </svg>
            {positions.map(({ hypothesis, x, y }) => (
              <button
                className={`obs-hypothesis-node ${hypothesis.id === selectedId ? "selected" : ""}`}
                style={{ left: x, top: y }}
                key={hypothesis.id}
                onClick={() => setSelectedId(hypothesis.id)}
                aria-pressed={hypothesis.id === selectedId}
              >
                <div>
                  <span>{hypothesis.id.slice(0, 8)}</span>
                  <Badge status={hypothesis.status} />
                </div>
                <strong>{hypothesis.title || hypothesis.statement}</strong>
                <small>
                  {
                    data.experiments.filter(
                      (experiment) =>
                        experiment.hypothesis_id === hypothesis.id,
                    ).length
                  }{" "}
                  experiments
                </small>
              </button>
            ))}
          </div>
        </div>
        <div className="obs-legend">
          {[
            "untested",
            "testing",
            "supported",
            "contradicted",
            "inconclusive",
          ].map((status) => (
            <Badge key={status} status={status} />
          ))}
        </div>
      </section>
      {selected ? (
        <HypothesisDetail
          hypothesis={selected}
          data={data}
          onClose={() => setSelectedId("")}
        />
      ) : (
        <div className="obs-card obs-graph-help">
          <GitBranch size={27} />
          <h3>Follow a branch of inquiry</h3>
          <p>
            Each node links a scientific statement to the experiments and
            decisions that investigated it. Support is an agent interpretation
            until a researcher validates the associated finding.
          </p>
        </div>
      )}
    </div>
  );
}

function HypothesisDetail({
  hypothesis,
  data,
  onClose,
}: {
  hypothesis: Hypothesis;
  data: Snapshot;
  onClose: () => void;
}) {
  const experiments = data.experiments.filter(
      (experiment) => experiment.hypothesis_id === hypothesis.id,
    ),
    decisions = data.decisions.filter(
      (decision) => decision.hypothesis_id === hypothesis.id,
    );
  const experimentIds = new Set(experiments.map((experiment) => experiment.id));
  const runIds = new Set(
    data.runs
      .filter((run) => experimentIds.has(run.experiment_id))
      .map((run) => run.id),
  );
  return (
    <section className="obs-card obs-detail">
      <div className="obs-card-heading">
        <Badge status={hypothesis.status} />
        <button
          className="obs-icon-button"
          onClick={onClose}
          aria-label="Close hypothesis detail"
        >
          <X size={18} />
        </button>
      </div>
      <h2>{hypothesis.title}</h2>
      <DataText label="Scientific statement">{hypothesis.statement}</DataText>
      <DataText label="Rationale">{hypothesis.rationale}</DataText>
      <DataText label="Predicted measurable outcome">
        {hypothesis.prediction}
      </DataText>
      {hypothesis.parent_hypothesis_id && (
        <DataText label={words(hypothesis.relationship || "derived_from")}>
          {data.hypotheses.find(
            (item) => item.id === hypothesis.parent_hypothesis_id,
          )?.title || hypothesis.parent_hypothesis_id}
        </DataText>
      )}
      <div className="obs-data-text">
        <span>ASSOCIATED EXPERIMENTS</span>
        {experiments.length ? (
          experiments.map((experiment) => (
            <div className="obs-related" key={experiment.id}>
              <span>{experiment.title}</span>
              <Badge status={experiment.outcome || experiment.status} />
            </div>
          ))
        ) : (
          <p>No experiments registered yet.</p>
        )}
      </div>
      {decisions.map((decision) => (
        <div className="obs-decision" key={decision.id}>
          <div className="obs-inline">
            <Badge status={decision.outcome} />
            <span className="obs-subtle-label">AGENT INTERPRETATION</span>
          </div>
          <p>{decision.rationale}</p>
          <EvidenceLinks ids={decision.evidence_ids} data={data} />
          <DataText label="Proposed next action">
            {words(decision.next_action)}
          </DataText>
        </div>
      ))}
      <ObservationList
        observations={data.observations.filter((observation) =>
          runIds.has(observation.run_id),
        )}
        data={data}
      />
      <small className="obs-muted">
        Proposed by {hypothesis.agent} · {date(hypothesis.created_at)}
      </small>
    </section>
  );
}

export function ExperimentPanel({
  data,
  initialSelected = "",
}: {
  data: Snapshot;
  initialSelected?: string;
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [selectedId, setSelectedId] = useState(initialSelected);
  const experiments = data.experiments.filter(
    (experiment) =>
      (status === "all" ||
        experiment.status === status ||
        experiment.outcome === status) &&
      `${experiment.title} ${experiment.agent} ${data.hypotheses.find((item) => item.id === experiment.hypothesis_id)?.title || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selected = data.experiments.find(
    (experiment) => experiment.id === selectedId,
  );
  return (
    <div className="obs-experiments">
      <section className="obs-card">
        <div className="obs-card-heading">
          <div>
            <h2>Experiments</h2>
            <p className="obs-muted">
              Protocols, execution runs, and scientific outcomes remain
              distinct.
            </p>
          </div>
          <span className="obs-subtle-label">
            {data.experiments.length} REGISTERED
          </span>
        </div>
        <div className="obs-filters">
          <label className="obs-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search experiments, hypotheses, agents"
              aria-label="Search experiments"
            />
          </label>
          <label className="obs-sr-only" htmlFor="experiment-status">
            Experiment status
          </label>
          <select
            id="experiment-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses and outcomes</option>
            <option value="planned">Planned</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="supported">Supported</option>
            <option value="not_supported">Not supported</option>
            <option value="inconclusive">Inconclusive</option>
            <option value="technical_failure">Technical failure</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {experiments.length ? (
          <div className="obs-experiment-list">
            {experiments.map((experiment) => {
              const runs = data.runs.filter(
                  (run) => run.experiment_id === experiment.id,
                ),
                runIds = new Set(runs.map((run) => run.id)),
                observation = data.observations
                  .filter(
                    (item) =>
                      runIds.has(item.run_id) &&
                      item.metric_id === data.metrics[0]?.id &&
                      item.value != null,
                  )
                  .at(-1),
                analysis = data.analyses
                  .filter((item) => item.experiment_id === experiment.id)
                  .at(-1);
              return (
                <button
                  key={experiment.id}
                  className={selectedId === experiment.id ? "selected" : ""}
                  onClick={() => setSelectedId(experiment.id)}
                >
                  <div className="obs-experiment-main">
                    <div className="obs-inline">
                      <Badge status={experiment.status} />
                      {experiment.outcome && (
                        <Badge status={experiment.outcome} />
                      )}
                    </div>
                    <h3>{experiment.title}</h3>
                    <p>
                      {data.hypotheses.find(
                        (item) => item.id === experiment.hypothesis_id,
                      )?.title || "Legacy experiment · no linked hypothesis"}
                    </p>
                    {analysis && (
                      <p className="obs-conclusion">
                        {analysis.interpretation}
                      </p>
                    )}
                    <small>
                      {experiment.agent} · {runs.length}{" "}
                      {runs.length === 1 ? "run" : "runs"} · Created{" "}
                      {date(experiment.created_at)}
                    </small>
                  </div>
                  <div className="obs-experiment-value">
                    {observation ? (
                      <>
                        <strong>{numeric(observation.value)}</strong>
                        <span>{observation.unit || data.metrics[0]?.unit}</span>
                        <small>Latest reported metric</small>
                      </>
                    ) : (
                      <span>Awaiting measurements</span>
                    )}
                  </div>
                  <ChevronRight size={18} />
                </button>
              );
            })}
          </div>
        ) : (
          <Empty
            title={
              query || status !== "all"
                ? "No experiments match these filters"
                : "No experiments registered yet"
            }
          >
            {query || status !== "all"
              ? "Try another search or status."
              : "Your agent registers an experimental design before starting an execution run."}
          </Empty>
        )}
      </section>
      {selected && (
        <ExperimentDetail
          experiment={selected}
          data={data}
          onClose={() => setSelectedId("")}
        />
      )}
    </div>
  );
}

function ExperimentDetail({
  experiment,
  data,
  onClose,
}: {
  experiment: Experiment;
  data: Snapshot;
  onClose: () => void;
}) {
  const detail = useRef<HTMLElement>(null);
  useEffect(() => {
    detail.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [experiment.id]);
  const runs = data.runs.filter((run) => run.experiment_id === experiment.id),
    runIds = new Set(runs.map((run) => run.id)),
    analyses = data.analyses.filter(
      (analysis) => analysis.experiment_id === experiment.id,
    ),
    decisions = data.decisions.filter(
      (decision) => decision.experiment_id === experiment.id,
    ),
    artifacts = data.artifacts.filter((artifact) =>
      runIds.has(artifact.run_id),
    );
  return (
    <section ref={detail} className="obs-card obs-detail">
      <div className="obs-card-heading">
        <div>
          <span className="obs-eyebrow">EXPERIMENT DETAIL</span>
          <h2>{experiment.title}</h2>
        </div>
        <button
          className="obs-icon-button"
          onClick={onClose}
          aria-label="Close experiment detail"
        >
          <X size={19} />
        </button>
      </div>
      <div className="obs-inline">
        <Badge status={experiment.status} />
        {experiment.outcome && <Badge status={experiment.outcome} />}
      </div>
      <DataText label="Scientific purpose">
        {data.hypotheses.find(
          (hypothesis) => hypothesis.id === experiment.hypothesis_id,
        )?.statement || "No linked hypothesis."}
      </DataText>
      <DataText label="Methodology">{experiment.method}</DataText>
      <DataText label="Registered success criteria">
        {experiment.success_criteria}
      </DataText>
      <BaselineComparison data={data} experimentId={experiment.id} />
      <details className="obs-details">
        <summary>Experimental design and provenance</summary>
        <DataText label="Inputs and dataset">{experiment.inputs}</DataText>
        <DataText label="Evaluation conditions">
          {experiment.conditions}
        </DataText>
        {experiment.variables != null && (
          <pre>{JSON.stringify(experiment.variables, null, 2)}</pre>
        )}
        {experiment.controls != null && (
          <pre>{JSON.stringify(experiment.controls, null, 2)}</pre>
        )}
      </details>
      <h3>Execution runs</h3>
      {runs.length ? (
        runs.map((run) => (
          <div className="obs-run-card" key={run.id}>
            <div className="obs-card-heading">
              <strong>{run.agent}</strong>
              <Badge
                status={
                  run.stale && run.status === "running" ? "stale" : run.status
                }
              />
            </div>
            {run.task && <p>{run.task}</p>}
            {run.progress != null && (
              <div className="obs-run-progress">
                <progress
                  max={100}
                  value={Math.min(100, Math.max(0, Number(run.progress)))}
                />
                <span>{numeric(run.progress)}%</span>
              </div>
            )}
            <small>
              Started {date(run.started_at)} ·{" "}
              {run.completed_at
                ? `Completed ${date(run.completed_at)}`
                : `Last heartbeat ${date(run.last_heartbeat_at)}`}
            </small>
            <details className="obs-details">
              <summary>Run configuration and technical details</summary>
              <p>
                Run ID: <code>{run.id}</code>
              </p>
              <pre>{JSON.stringify(run.configuration || {}, null, 2)}</pre>
            </details>
          </div>
        ))
      ) : (
        <p className="obs-muted">No runs started.</p>
      )}
      <ObservationList
        observations={data.observations.filter((observation) =>
          runIds.has(observation.run_id),
        )}
        data={data}
      />
      <h3>Analysis and uncertainty</h3>
      {analyses.length ? (
        analyses.map((analysis) => (
          <article className="obs-analysis" key={analysis.id}>
            <span className="obs-subtle-label">
              AGENT INTERPRETATION ·{" "}
              {analysis.conclusive ? "REPORTED CONCLUSIVE" : "NOT CONCLUSIVE"}
            </span>
            <p>{analysis.interpretation}</p>
            <DataText label="Comparison against prediction and baseline">
              {analysis.comparison}
            </DataText>
            <DataText label="Limitations">
              {analysis.limitations || "Not reported"}
            </DataText>
            <DataText label="Uncertainty">
              {analysis.uncertainty || "Not reported"}
            </DataText>
            <DataText label="Potential confounding factors">
              {analysis.confounders || "Not reported"}
            </DataText>
            <small>
              {analysis.agent} · {date(analysis.created_at)}
            </small>
          </article>
        ))
      ) : (
        <p className="obs-muted">
          No interpretation recorded. Observations above are measurements, not
          conclusions.
        </p>
      )}
      <h3>Scientific decisions</h3>
      {decisions.length ? (
        decisions.map((decision) => (
          <article className="obs-decision" key={decision.id}>
            <Badge status={decision.outcome} />
            <p>{decision.rationale}</p>
            <EvidenceLinks ids={decision.evidence_ids} data={data} />
            <DataText label="Next proposed action">
              {words(decision.next_action)}
            </DataText>
          </article>
        ))
      ) : (
        <p className="obs-muted">No scientific decision recorded.</p>
      )}
      <details className="obs-details">
        <summary>
          Artifacts and reproducibility information ({artifacts.length})
        </summary>
        {artifacts.length ? (
          artifacts.map((artifact) => (
            <div className="obs-artifact" key={artifact.id}>
              <strong>{words(artifact.type)}</strong>
              <DataText label="Version">{artifact.version}</DataText>
              <DataText label="Checksum">{artifact.checksum}</DataText>
              <code>{artifact.url || artifact.id}</code>
              <p>
                <Link
                  href={`/api/research/artifacts/${artifact.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="obs-text-link"
                >
                  Inspect protected artifact metadata <ArrowUpRight size={13} />
                </Link>
              </p>
              <pre>{JSON.stringify(artifact.metadata || {}, null, 2)}</pre>
            </div>
          ))
        ) : (
          <p>No artifacts registered.</p>
        )}
      </details>
    </section>
  );
}

function BaselineComparison({
  data,
  experimentId,
}: {
  data: Snapshot;
  experimentId: string;
}) {
  const metric = data.metrics[0];
  if (!metric) return null;
  const completedRuns = new Set(
    data.runs
      .filter(
        (run) =>
          run.experiment_id === experimentId && run.status === "completed",
      )
      .map((run) => run.id),
  );
  const compatible = data.observations.filter(
    (observation) =>
      completedRuns.has(observation.run_id) &&
      observation.metric_id === metric.id &&
      observation.value != null &&
      observation.unit === metric.unit &&
      observation.conditions_key === metric.evaluation_protocol,
  );
  const latest = compatible.at(-1);
  if (!latest)
    return (
      <div className="obs-baseline">
        <span className="obs-subtle-label">BASELINE COMPARISON</span>
        <p>
          No comparable completed measurement is available. The metric
          definition, unit, and evaluation conditions must match the registered
          protocol.
        </p>
      </div>
    );
  const delta =
    metric.baseline == null
      ? null
      : Number(latest.value) - Number(metric.baseline);
  return (
    <div className="obs-baseline">
      <span className="obs-subtle-label">
        BASELINE COMPARISON · AGENT REPORTED
      </span>
      <div>
        <strong>
          {numeric(latest.value)} <small>{latest.unit}</small>
        </strong>
        <span>
          Baseline {numeric(metric.baseline)} {metric.unit}
        </span>
        <span>
          {delta == null
            ? "Baseline unavailable"
            : `${delta > 0 ? "+" : ""}${numeric(delta)} ${metric.unit || ""} change`}
        </span>
      </div>
      <p>
        Evaluation conditions match the registered protocol. This comparison
        describes a measurement; it does not establish scientific support.
      </p>
    </div>
  );
}

function ObservationList({
  observations,
  data,
}: {
  observations: Observation[];
  data: Snapshot;
}) {
  return (
    <div className="obs-observations">
      <h3>Recorded observations</h3>
      {observations.length ? (
        observations.map((observation) => (
          <article id={`evidence-${observation.id}`} key={observation.id}>
            <div className="obs-card-heading">
              <strong>
                {data.metrics.find(
                  (metric) => metric.id === observation.metric_id,
                )?.name || "Qualitative observation"}
              </strong>
              <time>{date(observation.created_at)}</time>
            </div>
            {observation.value != null && (
              <div className="obs-measurement">
                {numeric(observation.value)} <small>{observation.unit}</small>
              </div>
            )}
            {observation.qualitative && <p>{observation.qualitative}</p>}
            <div className="obs-observation-meta">
              <span>
                Sample size: {observation.sample_size ?? "not reported"}
              </span>
              <span>
                Uncertainty: {observation.uncertainty || "not reported"}
              </span>
            </div>
            <DataText label="Evidence reference">
              {observation.evidence || "No evidence reference recorded."}
            </DataText>
            <small className="obs-muted">
              Evaluation conditions:{" "}
              {observation.conditions_key ||
                "not specified; excluded from comparison charts"}
            </small>
          </article>
        ))
      ) : (
        <p className="obs-muted">No observations recorded.</p>
      )}
    </div>
  );
}

export function ActivityPanel({ data }: { data: Snapshot }) {
  const [agent, setAgent] = useState("all"),
    [type, setType] = useState("all"),
    [since, setSince] = useState("");
  const agents = [...new Set(data.events.map((event) => event.actor))],
    types = [...new Set(data.events.map((event) => event.event_type))];
  const events = data.events
    .filter(
      (event) =>
        (agent === "all" || event.actor === agent) &&
        (type === "all" || event.event_type === type) &&
        (!since || event.created_at >= new Date(since).toISOString()),
    )
    .slice()
    .reverse();
  return (
    <section className="obs-card">
      <div className="obs-card-heading">
        <div>
          <h2>The scientific activity trail</h2>
          <p className="obs-muted">
            Persisted actions and decisions, in chronological order.
          </p>
        </div>
        <Activity size={18} />
      </div>
      <div className="obs-filters">
        <label>
          Agent
          <select
            value={agent}
            onChange={(event) => setAgent(event.target.value)}
          >
            <option value="all">All agents and researchers</option>
            {agents.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Event type
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="all">All scientific events</option>
            {types.map((name) => (
              <option key={name} value={name}>
                {words(name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Since
          <input
            type="date"
            value={since}
            onChange={(event) => setSince(event.target.value)}
          />
        </label>
      </div>
      {events.length ? (
        <div className="obs-timeline">
          {events.map((event) => (
            <article key={event.id}>
              <div className="obs-timeline-dot">
                <Activity size={13} />
              </div>
              <div>
                <div className="obs-card-heading">
                  <span className="obs-subtle-label">
                    {words(event.event_type).toUpperCase()}
                  </span>
                  <time>{date(event.created_at)}</time>
                </div>
                <h3>{event.description || words(event.event_type)}</h3>
                <small>
                  {event.actor} · Event #{event.id}
                </small>
                <details className="obs-details">
                  <summary>Entity and structured details</summary>
                  <p>
                    {event.entity_id
                      ? `Linked entity: ${event.entity_id}`
                      : "Campaign event"}
                  </p>
                  <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                </details>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="No matching activity">
          Research events appear as agents register hypotheses, execute
          experiments, and record findings.
        </Empty>
      )}
    </section>
  );
}

export function ReviewPanel({
  data,
  onUpdated,
}: {
  data: Snapshot;
  onUpdated: () => void;
}) {
  const [filter, setFilter] = useState("pending"),
    [feedback, setFeedback] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const reviews = data.reviews.filter(
    (review) => filter === "all" || review.status === filter,
  );
  const attempts = useRef<Record<string, { payload: string; key: string }>>({});
  async function decide(id: string, decision: "approved" | "rejected") {
    setBusy(id);
    setError("");
    const input = {
      campaign_id: data.campaign.id,
      review_id: id,
      decision,
      feedback: feedback[id] || "",
    };
    const payload = JSON.stringify(input);
    if (attempts.current[id]?.payload !== payload)
      attempts.current[id] = { payload, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review_request",
          input,
          idempotency_key: attempts.current[id].key,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to save your review.");
      onUpdated();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save review.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="obs-card">
      <div className="obs-card-heading">
        <div>
          <h2>Researcher review</h2>
          <p className="obs-muted">
            Only an authorized researcher can approve or reject these requests.
          </p>
        </div>
        <label className="obs-inline-label">
          Show
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="pending">Pending requests</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All requests</option>
          </select>
        </label>
      </div>
      {error && (
        <p className="obs-form-error" role="alert">
          {error}
        </p>
      )}
      {reviews.length ? (
        <div className="obs-review-list">
          {reviews.map((review) => (
            <article key={review.id}>
              <div className="obs-card-heading">
                <span className="obs-subtle-label">
                  {review.requested_by} · {date(review.created_at)}
                </span>
                <Badge status={review.status} />
              </div>
              <h3>{review.proposed_action}</h3>
              <DataText label="Scientific rationale">
                {review.rationale}
              </DataText>
              <EvidenceLinks ids={review.evidence_ids} data={data} />
              <DataText label="Potential impact">
                {review.impact || "Not specified by the agent."}
              </DataText>
              <DataText label="Relevant costs or risks">
                {review.costs || "Not specified by the agent."}
              </DataText>
              {review.status === "pending" ? (
                <>
                  <label className="obs-feedback">
                    Researcher feedback (optional)
                    <textarea
                      value={feedback[review.id] || ""}
                      onChange={(event) =>
                        setFeedback((items) => ({
                          ...items,
                          [review.id]: event.target.value,
                        }))
                      }
                      maxLength={4000}
                      placeholder="Conditions, questions, or the reason for your decision"
                    />
                  </label>
                  <div className="obs-review-actions">
                    <button
                      className="obs-button"
                      disabled={!!busy}
                      onClick={() => void decide(review.id, "rejected")}
                    >
                      <X size={15} /> Reject
                    </button>
                    <button
                      className="obs-button obs-primary"
                      disabled={!!busy}
                      onClick={() => void decide(review.id, "approved")}
                    >
                      <Check size={15} />
                      {busy === review.id ? "Saving…" : "Approve action"}
                    </button>
                  </div>
                  <small className="obs-muted">
                    Approval records your decision. The agent remains
                    responsible for carrying out the approved action.
                  </small>
                </>
              ) : (
                <>
                  <DataText label="Researcher feedback">
                    {review.feedback || "No feedback provided."}
                  </DataText>
                  <small className="obs-muted">
                    Reviewed by{" "}
                    {review.reviewer_name || "an authorized researcher"}
                  </small>
                </>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            filter === "pending"
              ? "Nothing waiting for your review"
              : "No requests in this view"
          }
        >
          Agents can request approval before consequential follow-up work. Your
          decisions remain in the campaign’s audit trail.
        </Empty>
      )}
    </section>
  );
}
