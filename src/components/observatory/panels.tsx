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
  const metric = data.metrics[0];
  const active = data.runs.filter((run) => run.status === "running");
  const stale = active.filter((run) => run.stale);
  const pending = data.reviews.filter((review) => review.status === "pending");
  const runsTruncated = data.runs.length >= 1500;
  const latestRun = runsTruncated
    ? undefined
    : data.runs.reduce<(typeof data.runs)[number] | undefined>(
        (latest, run) =>
          !latest ||
          (run.completed_at || run.started_at) >
            (latest.completed_at || latest.started_at)
            ? run
            : latest,
        undefined,
      );
  const latestDecision =
    data.decisions.length < 1000 ? data.decisions.at(-1) : undefined;
  const currentRun =
    data.summary.active_experiments > 0 ? active.at(-1) : latestRun;
  const latestFailure = latestRun?.status === "failed" ? latestRun : null;
  const hasAttention = pending.length > 0 || stale.length > 0;
  const hasMeasurements = data.observations.some(
    (observation) =>
      observation.metric_id === metric?.id &&
      observation.value != null &&
      observation.unit === metric?.unit &&
      observation.conditions_key === metric?.evaluation_protocol &&
      data.runs.some(
        (run) => run.id === observation.run_id && run.status === "completed",
      ),
  );
  const state =
    !runsTruncated && active.length && active.length === stale.length
      ? "Waiting for an agent update"
      : data.summary.active_experiments > 0
        ? `${data.summary.active_experiments} ${data.summary.active_experiments === 1 ? "experiment running" : "experiments running"}`
        : data.summary.pending_reviews > 0
          ? "Waiting for your review"
          : latestFailure
            ? "Latest run stopped before completion"
            : latestRun?.status === "completed"
              ? "Latest run completed"
              : "No experiments running";
  return (
    <div className="obs-overview">
      <section className="obs-card obs-objective">
        <div className="obs-card-heading">
          <span className="obs-eyebrow">Research question</span>
          <span className="obs-private">{data.campaign.visibility}</span>
        </div>
        <h2>{data.campaign.question}</h2>
        <div className="obs-current-state" role="status">
          <strong>{state}</strong>
          {data.summary.pending_reviews > 0 ? (
            <button
              className="obs-link-button"
              onClick={() => onNavigate("review")}
            >
              Review{" "}
              {data.summary.pending_reviews === 1
                ? "request"
                : `${data.summary.pending_reviews} requests`}{" "}
              <ArrowRight size={16} />
            </button>
          ) : currentRun ? (
            <button
              className="obs-link-button"
              onClick={() => onInspectExperiment(currentRun.experiment_id)}
            >
              View experiment <ArrowRight size={16} />
            </button>
          ) : data.summary.active_experiments > 0 ? (
            <button
              className="obs-link-button"
              onClick={() => onNavigate("experiments")}
            >
              View experiments <ArrowRight size={16} />
            </button>
          ) : null}
        </div>
        {metric && (
          <div className="obs-objective-metrics obs-overview-metrics">
            <div>
              <span>Metric</span>
              <strong>{words(metric.name)}</strong>
            </div>
            <div>
              <span>
                Target ·{" "}
                {metric.direction === "range"
                  ? "within range"
                  : metric.direction === "minimize"
                    ? "lower is better"
                    : "higher is better"}
              </span>
              <strong>
                {numeric(metric.target)}
                {metric.direction === "range"
                  ? ` – ${numeric(metric.target_max)}`
                  : ""}
                <small>
                  {metric.unit === "dimensionless" ? "" : metric.unit}
                </small>
              </strong>
            </div>
            <div>
              <span>Best result</span>
              <strong>
                {data.summary.best_result == null
                  ? "Not available"
                  : numeric(data.summary.best_result)}
                {data.summary.best_result != null && (
                  <small>
                    {metric.unit === "dimensionless" ? "" : metric.unit}
                  </small>
                )}
              </strong>
            </div>
          </div>
        )}
        <details className="obs-details">
          <summary>Research plan</summary>
          <DataText label="Objective">
            {data.campaign.objective || data.campaign.summary}
          </DataText>
          {metric && (
            <>
              <DataText label="Evaluation method">
                {metric.evaluation_protocol}
              </DataText>
              {metric.baseline != null && (
                <DataText label="Baseline">
                  {numeric(metric.baseline)}{" "}
                  {metric.unit === "dimensionless" ? "" : metric.unit}
                </DataText>
              )}
            </>
          )}
          <DataText label="Constraints">{data.campaign.constraints}</DataText>
          <DataText label="When to stop">
            {data.campaign.stop_conditions}
          </DataText>
          {data.summary.best_verified_result != null && (
            <DataText label="Best reproduced result">
              {numeric(data.summary.best_verified_result)} {metric?.unit}
            </DataText>
          )}
        </details>
      </section>
      {hasAttention && (
        <section className="obs-card">
          <div className="obs-card-heading">
            <h2>Needs attention</h2>
            <TriangleAlert size={20} className="obs-warning" />
          </div>
          <div className="obs-attention-list">
            {pending.map((review) => (
              <button key={review.id} onClick={() => onNavigate("review")}>
                <ShieldCheck size={19} />
                <span>
                  <strong>Approval requested</strong>
                  <small>{review.proposed_action}</small>
                </span>
                <ChevronRight size={19} />
              </button>
            ))}
            {stale.map((run) => (
              <button
                key={run.id}
                onClick={() => onInspectExperiment(run.experiment_id)}
              >
                <Clock3 size={19} />
                <span>
                  <strong>{run.agent} has stopped reporting</strong>
                  <small>Run status is unknown.</small>
                </span>
                <ChevronRight size={19} />
              </button>
            ))}
          </div>
        </section>
      )}
      {active.length > 0 && (
        <section className="obs-card">
          <div className="obs-card-heading">
            <h2>Running now</h2>
          </div>
          {active.slice(0, 4).map((run) => (
            <div className="obs-active-run" key={run.id}>
              <div className="obs-card-heading">
                <h3>
                  {data.experiments.find(
                    (item) => item.id === run.experiment_id,
                  )?.title || "Experiment"}
                </h3>
                <Badge status={run.stale ? "stale" : run.status} />
              </div>
              {run.task && <p>{run.task}</p>}
              {run.progress != null && (
                <div className="obs-run-progress">
                  <progress
                    max={100}
                    value={Math.max(0, Math.min(100, Number(run.progress)))}
                    aria-label="Run progress"
                  />
                  <span>{numeric(run.progress)}%</span>
                </div>
              )}
              <small>
                {run.agent} · Updated{" "}
                {date(run.last_heartbeat_at || run.started_at)}
              </small>
              <button
                className="obs-link-button"
                onClick={() => onInspectExperiment(run.experiment_id)}
              >
                View experiment <ArrowRight size={16} />
              </button>
            </div>
          ))}
        </section>
      )}
      {latestDecision && (
        <section className="obs-card">
          <div className="obs-card-heading">
            <h2>Latest conclusion</h2>
            <Badge status={latestDecision.outcome} />
          </div>
          <p>{latestDecision.rationale}</p>
          <details className="obs-details">
            <summary>Evidence and next step</summary>
            <EvidenceLinks ids={latestDecision.evidence_ids} data={data} />
            <DataText label="Next step">
              {words(latestDecision.next_action)}
            </DataText>
            <small>
              {latestDecision.agent} · {date(latestDecision.created_at)}
            </small>
          </details>
        </section>
      )}
      {hasMeasurements && (
        <MetricTrend data={data} onInspectExperiment={onInspectExperiment} />
      )}
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
            Publish findings
          </span>
        </summary>
        <p className="obs-muted">
          Selected experiments and the campaign summary will be public,
          including methods, observations, evidence, and limitations. Review
          them for private information before publishing. Run configurations and
          activity remain private.
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
                I reviewed the selected experiments and campaign summary and
                approve making them public.
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
        <Empty title="No hypotheses yet">
          Connect an agent to register a testable prediction.
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
            <h2>Hypotheses</h2>
          </div>
          <span className="obs-subtle-label">
            {data.hypotheses.length} total
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
      </section>
      {selected ? (
        <HypothesisDetail
          hypothesis={selected}
          data={data}
          onClose={() => setSelectedId("")}
        />
      ) : (
        <div className="obs-card obs-graph-help">
          <p>Select a hypothesis to see its prediction and evidence.</p>
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
      <DataText label="Hypothesis">{hypothesis.statement}</DataText>
      <DataText label="Prediction">{hypothesis.prediction}</DataText>
      <details className="obs-details">
        <summary>Rationale</summary>
        <p>{hypothesis.rationale}</p>
      </details>
      {hypothesis.parent_hypothesis_id && (
        <DataText label={words(hypothesis.relationship || "derived_from")}>
          {data.hypotheses.find(
            (item) => item.id === hypothesis.parent_hypothesis_id,
          )?.title || hypothesis.parent_hypothesis_id}
        </DataText>
      )}
      <div className="obs-data-text">
        <span>Experiments</span>
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
          </div>
          <span className="obs-subtle-label">
            {data.experiments.length} total
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
                  .at(-1);
              return (
                <button
                  key={experiment.id}
                  className={selectedId === experiment.id ? "selected" : ""}
                  onClick={() => setSelectedId(experiment.id)}
                >
                  <div className="obs-experiment-main">
                    <div className="obs-inline">
                      <Badge status={experiment.outcome || experiment.status} />
                    </div>
                    <h3>{experiment.title}</h3>
                    <p>
                      {
                        data.hypotheses.find(
                          (item) => item.id === experiment.hypothesis_id,
                        )?.title
                      }
                    </p>
                    <small>
                      {experiment.agent} · {runs.length}{" "}
                      {runs.length === 1 ? "run" : "runs"}
                    </small>
                  </div>
                  <div className="obs-experiment-value">
                    {observation ? (
                      <>
                        <strong>{numeric(observation.value)}</strong>
                        <span>{observation.unit || data.metrics[0]?.unit}</span>
                        <small>Latest result</small>
                      </>
                    ) : (
                      <span>No measurements</span>
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
              : "Your agent can register an experiment here."}
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
        <Badge status={experiment.outcome || experiment.status} />
      </div>
      <BaselineComparison data={data} experimentId={experiment.id} />
      <details className="obs-details">
        <summary>Method and success criteria</summary>
        <DataText label="Hypothesis">
          {
            data.hypotheses.find(
              (hypothesis) => hypothesis.id === experiment.hypothesis_id,
            )?.statement
          }
        </DataText>
        <DataText label="Method">{experiment.method}</DataText>
        <DataText label="Success criteria">
          {experiment.success_criteria}
        </DataText>
        <DataText label="Inputs">{experiment.inputs}</DataText>
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
      <details className="obs-details">
        <summary>Runs ({runs.length})</summary>
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
                <summary>Configuration</summary>
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
      </details>
      <ObservationList
        observations={data.observations.filter((observation) =>
          runIds.has(observation.run_id),
        )}
        data={data}
      />
      <h3>Analysis</h3>
      {analyses.length ? (
        analyses.map((analysis) => (
          <article className="obs-analysis" key={analysis.id}>
            <span className="obs-subtle-label">
              {analysis.conclusive
                ? "Conclusive · agent assessment"
                : "Inconclusive"}
            </span>
            <p>{analysis.interpretation}</p>
            <details className="obs-details">
              <summary>Comparison and limitations</summary>
              <DataText label="Comparison">{analysis.comparison}</DataText>
              <DataText label="Limitations">{analysis.limitations}</DataText>
              <DataText label="Uncertainty">{analysis.uncertainty}</DataText>
              <DataText label="Potential confounding factors">
                {analysis.confounders}
              </DataText>
            </details>
            <small>
              {analysis.agent} · {date(analysis.created_at)}
            </small>
          </article>
        ))
      ) : (
        <p className="obs-muted">No analysis yet.</p>
      )}
      <details className="obs-details">
        <summary>Decisions and next steps ({decisions.length})</summary>
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
      </details>
      <details className="obs-details">
        <summary>Artifacts ({artifacts.length})</summary>
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
                  View artifact <ArrowUpRight size={13} />
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
  if (!latest) return null;
  const delta =
    metric.baseline == null
      ? null
      : Number(latest.value) - Number(metric.baseline);
  return (
    <div className="obs-baseline">
      <span className="obs-subtle-label">Compared with baseline</span>
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
      <h3>Observations</h3>
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
            <details className="obs-details">
              <summary>Evidence and measurement details</summary>
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
            </details>
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
          <h2>Activity</h2>
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
                <small>{event.actor}</small>
                <details className="obs-details">
                  <summary>Record details</summary>
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
        <Empty title="No matching activity">Try another filter.</Empty>
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
          <h2>Review requests</h2>
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
