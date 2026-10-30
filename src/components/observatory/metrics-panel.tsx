"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import {
  date,
  numeric,
  words,
  type Metric,
  type Observation,
  type Snapshot,
} from "./types";
import "./metrics-charts.css";

function unitLabel(unit?: string) {
  return unit && unit !== "dimensionless" ? ` ${unit}` : "";
}

function measurements(data: Snapshot, metric: Metric) {
  const completed = new Set(
    data.runs.filter((run) => run.status === "completed").map((run) => run.id),
  );
  const replaced = new Set(
    data.observations.map((item) => item.supersedes_id).filter(Boolean),
  );
  return data.observations
    .filter(
      (item) =>
        item.metric_id === metric.id &&
        item.value != null &&
        Number.isFinite(Number(item.value)) &&
        (item.unit || "") === (metric.unit || "") &&
        completed.has(item.run_id) &&
        !replaced.has(item.id),
    )
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
}

export function MetricsPanel({
  data,
  onUpdated,
  onInspectExperiment,
}: {
  data: Snapshot;
  onUpdated: () => void;
  onInspectExperiment: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="obs-card obs-metrics-panel">
      <div className="obs-card-heading">
        <h2>Metrics</h2>
        <button
          className="obs-link-button"
          onClick={() => setAdding(!adding)}
          aria-expanded={adding}
        >
          <Plus size={17} /> Add metric
        </button>
      </div>
      {adding && (
        <MetricForm
          campaignId={data.campaign.id}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            onUpdated();
          }}
        />
      )}
      {data.metrics.length ? (
        <div className="obs-metric-grid">
          {data.metrics.map((metric, index) => (
            <MetricCard
              key={metric.id}
              metric={metric}
              primary={index === 0}
              data={data}
              onInspectExperiment={onInspectExperiment}
            />
          ))}
        </div>
      ) : (
        <p className="obs-muted">No metrics registered yet.</p>
      )}
    </section>
  );
}

function MetricCard({
  metric,
  primary,
  data,
  onInspectExperiment,
}: {
  metric: Metric;
  primary: boolean;
  data: Snapshot;
  onInspectExperiment: (id: string) => void;
}) {
  const points = useMemo(() => measurements(data, metric), [data, metric]);
  const summary = data.summary.metric_results?.find(
    (item) => item.metric_id === metric.id,
  );
  const best =
    summary?.best_result ?? (primary ? data.summary.best_result : null);
  const latest = summary?.latest_result;
  const latestShown = points.at(-1);
  const latestValue = latest?.value ?? latestShown?.value;
  const hasLatest = latestValue != null;
  return (
    <article className="obs-metric-card">
      <div className="obs-card-heading">
        <h3>{words(metric.name)}</h3>
        {primary && <span className="obs-subtle-label">Primary</span>}
      </div>
      <div className="obs-metric-values">
        <div>
          <span>Target</span>
          <strong>
            {numeric(metric.target)}
            {metric.direction === "range"
              ? ` – ${numeric(metric.target_max)}`
              : ""}
            {unitLabel(metric.unit)}
          </strong>
          <small>
            {metric.direction === "minimize"
              ? "Lower is better"
              : metric.direction === "maximize"
                ? "Higher is better"
                : "Within this range"}
          </small>
        </div>
        <div>
          <span>Best comparable result</span>
          <strong
            className={
              best == null ? "obs-metric-missing" : "obs-metric-result"
            }
          >
            {best == null
              ? "Not available"
              : `${numeric(best)}${unitLabel(metric.unit)}`}
          </strong>
        </div>
      </div>
      {hasLatest && (
        <p className="obs-metric-latest">
          {latest
            ? "Latest comparable measurement"
            : data.observations.length < 3000
              ? "Latest measurement"
              : "Last shown measurement"}
          :{" "}
          <strong>
            {numeric(latestValue)}
            {unitLabel(metric.unit)}
          </strong>
        </p>
      )}
      {points.length > 0 && (
        <MetricGraph
          metric={metric}
          points={points}
          data={data}
          onInspectExperiment={onInspectExperiment}
        />
      )}
      <details className="obs-details">
        <summary>Metric definition</summary>
        <p>{metric.evaluation_protocol}</p>
        {metric.baseline != null && (
          <p>
            Baseline: {numeric(metric.baseline)}
            {unitLabel(metric.unit)}
          </p>
        )}
        {summary?.best_verified_result != null && (
          <p>
            Best reproduced result: {numeric(summary.best_verified_result)}
            {unitLabel(metric.unit)}
          </p>
        )}
      </details>
    </article>
  );
}

function MetricGraph({
  metric,
  points,
  data,
  onInspectExperiment,
}: {
  metric: Metric;
  points: Observation[];
  data: Snapshot;
  onInspectExperiment: (id: string) => void;
}) {
  const conditions = [
    ...new Set(points.map((item) => item.conditions_key || "")),
  ];
  const defaultCondition = conditions.includes(metric.evaluation_protocol)
    ? metric.evaluation_protocol
    : points.at(-1)?.conditions_key || "";
  const [selection, setSelection] = useState<string | null>(null);
  const condition =
    selection !== null && conditions.includes(selection)
      ? selection
      : defaultCondition;
  const series = points.filter(
    (item) => (item.conditions_key || "") === condition,
  );
  const comparable = condition === metric.evaluation_protocol;
  const values = series.map((point) => Number(point.value));
  if (comparable) {
    values.push(Number(metric.target));
    if (metric.target_max != null) values.push(Number(metric.target_max));
    if (metric.baseline != null) values.push(Number(metric.baseline));
  }
  const low = Math.min(...values),
    high = Math.max(...values);
  const magnitude = Math.max(Math.abs(low), Math.abs(high), Number.MIN_VALUE);
  const floor = low / magnitude,
    ceiling = high / magnitude;
  const padding = Math.max((ceiling - floor) * 0.15, 0.01);
  const y = (value: number) =>
    170 -
    ((value / magnitude - floor + padding) / (ceiling - floor + 2 * padding)) *
      135;
  const x = (index: number) =>
    series.length === 1 ? 260 : 70 + index * (360 / (series.length - 1));
  const conditionName = (key: string, index: number) =>
    key === metric.evaluation_protocol
      ? "Registered evaluation"
      : key
        ? `Evaluation ${index + 1}`
        : "Conditions not recorded";
  return (
    <div className="obs-metric-graph">
      {conditions.length > 1 && (
        <label>
          Evaluation
          <select
            value={condition}
            onChange={(event) => setSelection(event.target.value)}
          >
            {conditions.map((key, index) => (
              <option key={key} value={key}>
                {conditionName(key, index)}
              </option>
            ))}
          </select>
        </label>
      )}
      {!comparable && (
        <p className="obs-metric-context">
          {condition
            ? "Different evaluation conditions; shown separately."
            : "Evaluation conditions were not recorded."}
        </p>
      )}
      <div
        className="obs-metric-plot"
        role="img"
        aria-label={`${words(metric.name)}: ${series.length} recorded ${series.length === 1 ? "measurement" : "measurements"}, from ${numeric(Math.min(...series.map((point) => Number(point.value))))} to ${numeric(Math.max(...series.map((point) => Number(point.value))))}${unitLabel(metric.unit)}. Exact values are in the Measurements table.`}
      >
        <svg viewBox="0 0 500 220" aria-hidden="true">
          <line x1="65" x2="445" y1="180" y2="180" stroke="#46515b" />
          <text x="8" y="42" fill="#a5b2bd">
            {numeric(high)}
          </text>
          <text x="8" y="170" fill="#a5b2bd">
            {numeric(low)}
          </text>
          {comparable && (
            <>
              <line
                x1="65"
                x2="445"
                y1={y(Number(metric.target))}
                y2={y(Number(metric.target))}
                stroke="#b5ed83"
                strokeDasharray="6 4"
              />
              {metric.direction === "range" && metric.target_max != null && (
                <line
                  x1="65"
                  x2="445"
                  y1={y(Number(metric.target_max))}
                  y2={y(Number(metric.target_max))}
                  stroke="#b5ed83"
                  strokeDasharray="6 4"
                />
              )}
              {metric.baseline != null && (
                <line
                  x1="65"
                  x2="445"
                  y1={y(Number(metric.baseline))}
                  y2={y(Number(metric.baseline))}
                  stroke="#a5b2bd"
                  strokeDasharray="4 4"
                />
              )}
            </>
          )}
          {!!condition && series.length > 1 && (
            <polyline
              points={series
                .map((point, index) => `${x(index)},${y(Number(point.value))}`)
                .join(" ")}
              fill="none"
              stroke="#83bce5"
              strokeWidth="3"
            />
          )}
          {series.map((point, index) => (
            <circle
              key={point.id}
              cx={x(index)}
              cy={y(Number(point.value))}
              r="5"
              fill="#83bce5"
            >
              <title>
                {numeric(point.value)}
                {unitLabel(metric.unit)} · {date(point.created_at)}
              </title>
            </circle>
          ))}
          <text x="65" y="207" fill="#a5b2bd">
            First recorded
          </text>
          <text x="445" y="207" textAnchor="end" fill="#a5b2bd">
            {series.length === 1
              ? "1 measurement"
              : `${series.length} measurements`}
          </text>
        </svg>
      </div>
      {comparable && (
        <div className="obs-metric-legend">
          <span className="obs-legend-measured">Measured</span>
          <span className="obs-legend-target">Target</span>
          {metric.baseline != null && (
            <span className="obs-legend-baseline">Baseline</span>
          )}
        </div>
      )}
      <details className="obs-details">
        <summary>Measurements ({series.length})</summary>
        <div className="obs-metric-table-wrap">
          <table className="obs-metric-table">
            <thead>
              <tr>
                <th>Value</th>
                <th>Recorded</th>
                <th>Experiment</th>
              </tr>
            </thead>
            <tbody>
              {series.map((point) => {
                const run = data.runs.find((item) => item.id === point.run_id);
                return (
                  <tr key={point.id}>
                    <td>
                      {numeric(point.value)}
                      {unitLabel(metric.unit)}
                    </td>
                    <td>{date(point.created_at)}</td>
                    <td>
                      {run && (
                        <button
                          className="obs-link-button"
                          onClick={() => onInspectExperiment(run.experiment_id)}
                        >
                          View <ArrowRight size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {condition && (
          <details className="obs-details">
            <summary>Evaluation conditions</summary>
            <p>{condition}</p>
          </details>
        )}
      </details>
    </div>
  );
}

function MetricForm({
  campaignId,
  onClose,
  onSaved,
}: {
  campaignId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState("maximize");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef({ payload: "", key: "" });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      text = (key: string) => String(form.get(key) || "").trim();
    const input = {
      campaign_id: campaignId,
      metric: {
        name: text("name"),
        unit: text("unit"),
        direction,
        target: Number(text("target")),
        ...(text("baseline") ? { baseline: Number(text("baseline")) } : {}),
        ...(direction === "range"
          ? { target_max: Number(text("target_max")) }
          : {}),
        evaluation_protocol: text("evaluation_protocol"),
      },
    };
    const payload = JSON.stringify(input);
    if (attempt.current.payload !== payload)
      attempt.current = { payload, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_metric",
          input,
          idempotency_key: attempt.current.key,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to add metric.");
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to add metric.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="obs-metric-form" onSubmit={submit}>
      <div className="obs-card-heading">
        <h3>Add metric</h3>
        <button
          type="button"
          className="obs-icon-button"
          aria-label="Close metric form"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="obs-form-grid">
        <label>
          Name
          <input
            name="name"
            required
            maxLength={200}
            placeholder="e.g. Forecast RMSE"
          />
        </label>
        <label>
          Unit
          <input name="unit" maxLength={80} placeholder="e.g. km/s" />
        </label>
        <label>
          Goal
          <select
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
          >
            <option value="maximize">Higher is better</option>
            <option value="minimize">Lower is better</option>
            <option value="range">Within a range</option>
          </select>
        </label>
        <label>
          {direction === "range" ? "Target minimum" : "Target"}
          <input type="number" step="any" name="target" required />
        </label>
        {direction === "range" && (
          <label>
            Target maximum
            <input type="number" step="any" name="target_max" required />
          </label>
        )}
        <label>
          Baseline (optional)
          <input type="number" step="any" name="baseline" />
        </label>
        <label className="obs-span-two">
          How it is measured
          <textarea
            name="evaluation_protocol"
            required
            minLength={10}
            maxLength={6000}
            rows={3}
            placeholder="Define the data, method, and conditions used for this metric."
          />
        </label>
      </div>
      {error && (
        <p className="obs-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="obs-form-actions">
        <button type="button" className="obs-button" onClick={onClose}>
          Cancel
        </button>
        <button className="obs-button obs-primary" disabled={busy}>
          {busy ? "Adding…" : "Add metric"}
        </button>
      </div>
    </form>
  );
}
