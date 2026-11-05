"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
  type ResearchChart,
  type Snapshot,
} from "./types";

import { MetricsPanel } from "./metrics-panel";
import { ChartsPanel } from "./charts-panel";
import { TablesPanel } from "./tables-panel";
import type { ComparisonTableData } from "@/components/comparison-table";
import { formatResearchText } from "@/lib/research-text";

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
      <p>
        {typeof children === "string" ? formatResearchText(children) : children}
      </p>
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
      <p>
        {typeof children === "string" ? formatResearchText(children) : children}
      </p>
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
        <h2>{formatResearchText(data.campaign.question)}</h2>
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
        <details className="obs-details">
          <summary>Research plan</summary>
          <DataText label="Objective">
            {data.campaign.objective || data.campaign.summary}
          </DataText>
          <DataText label="Constraints">{data.campaign.constraints}</DataText>
          <DataText label="When to stop">
            {data.campaign.stop_conditions}
          </DataText>
        </details>
      </section>
      <MetricsPanel
        data={data}
        onUpdated={onUpdated}
        onInspectExperiment={onInspectExperiment}
      />
      <ChartsPanel data={data} onUpdated={onUpdated} />
      <TablesPanel data={data} onUpdated={onUpdated} />
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
          <p>{formatResearchText(latestDecision.rationale)}</p>
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
  const [charts, setCharts] = useState<ResearchChart[]>([]);
  const [seriesCharts, setSeriesCharts] = useState<{id:string;title:string;published_at:string|null}[]>([]);
  const [nextSeriesOffset, setNextSeriesOffset] = useState<number | null>(null);
  const [selectedCharts, setSelectedCharts] = useState<string[]>([]);
  const selectedChartIds = useRef<string[]>([]);
  const [tables, setTables] = useState<ComparisonTableData[]>([]);
  const [nextTableOffset, setNextTableOffset] = useState<number | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [nextChartOffset, setNextChartOffset] = useState<number | null>(null);
  const [sharingOpen, setSharingOpen] = useState(false);
  const chartLoadGeneration = useRef(0);
  const chartEventVersion = data.events.at(-1)?.id;
  useEffect(() => { selectedChartIds.current = selectedCharts; }, [selectedCharts]);
  const loadCharts = useCallback(async (offset = 0) => {
    const generation = offset === 0 ? ++chartLoadGeneration.current : chartLoadGeneration.current;
    setLoadingCharts(true);
    try {
      const response = await fetch(
        `/api/research/charts?campaign_id=${encodeURIComponent(data.campaign.id)}&offset=${offset}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to load charts for publication.");
      if (generation !== chartLoadGeneration.current) return;
      setCharts((items) => offset === 0
        ? [...(body.charts || []), ...items.filter((item) => selectedChartIds.current.includes(item.id) && !body.charts.some((chart: ResearchChart) => chart.id === item.id))]
        : [...items, ...body.charts.filter((chart: ResearchChart) => !items.some((item) => item.id === chart.id))]);
      setNextChartOffset(body.next_offset ?? null);
      if (offset !== 0) return;
      const tablesResponse = await fetch(`/api/research/tables?campaign_id=${encodeURIComponent(data.campaign.id)}&limit=30`, { cache: "no-store" });
      const tablesBody = await tablesResponse.json();
      if (!tablesResponse.ok) throw new Error(tablesBody.error || "Unable to load tables for publication.");
      if (generation !== chartLoadGeneration.current) return;
      setTables(tablesBody.tables || []);
      setNextTableOffset(tablesBody.next_offset ?? null);
      const seriesResponse = await fetch(`/api/research/series?campaign_id=${encodeURIComponent(data.campaign.id)}&limit=50`, {cache:"no-store"});
      const seriesBody = await seriesResponse.json();
      if (!seriesResponse.ok) throw new Error(seriesBody.error || "Unable to load interactive charts.");
      if (generation !== chartLoadGeneration.current) return;
      setSeriesCharts(seriesBody.charts || []);
      setNextSeriesOffset(seriesBody.next_offset ?? null);
    } catch (cause) {
      if (generation === chartLoadGeneration.current)
        setError(cause instanceof Error ? cause.message : "Unable to load charts.");
    } finally {
      if (generation === chartLoadGeneration.current) setLoadingCharts(false);
    }
  }, [data.campaign.id]);
  useEffect(() => {
    if (sharingOpen) void loadCharts();
    return () => { chartLoadGeneration.current += 1; };
  }, [sharingOpen, loadCharts, chartEventVersion]);
  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess(false);
    const input = {
        campaign_id: data.campaign.id,
        experiment_ids: selected,
        chart_ids: selectedCharts,
        table_ids: selectedTables,
      },
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
      setSelectedCharts([]);
      setSelectedTables([]);
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
      <details
        onToggle={(event) => {
          setSharingOpen(event.currentTarget.open);
        }}
      >
        <summary className="obs-share-heading">
          <span>
            <ShieldCheck size={18} />
            Publish findings
          </span>
        </summary>
        <p className="obs-muted">
          Selected experiments, charts, tables, and the campaign summary will be public,
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
                      if (!event.target.checked)
                        setSelectedCharts((items) =>
                          items.filter(
                            (id) =>
                              charts.find((chart) => chart.id === id)
                                ?.experiment_id !== experiment.id,
                          ),
                        );
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
            {loadingCharts && <p role="status">Loading charts…</p>}
            {charts.length > 0 && (
              <div className="obs-share-list">
                <h3>Charts</h3>
                {charts.map((chart) => {
                  const canSelect =
                    !chart.experiment_id ||
                    selected.includes(chart.experiment_id) ||
                    !!chart.published_at;
                  return (
                    <label key={chart.id}>
                      <input
                        type="checkbox"
                        checked={selectedCharts.includes(chart.id)}
                        disabled={!canSelect || (selectedCharts.length >= 1000 && !selectedCharts.includes(chart.id))}
                        onChange={(event) =>
                          setSelectedCharts((items) =>
                            event.target.checked
                              ? [...items, chart.id]
                              : items.filter((id) => id !== chart.id),
                          )
                        }
                      />
                      <span>
                        {chart.title}
                        <small>
                          {canSelect
                            ? "Include this chart"
                            : "Select its experiment above to include this chart"}
                        </small>
                      </span>
                    </label>
                  );
                })}
                {nextChartOffset !== null && <button type="button" className="obs-link-button" disabled={loadingCharts} onClick={() => void loadCharts(nextChartOffset)}>Load more charts</button>}
                {selectedCharts.length >= 1000 && <p className="obs-muted">Publish up to 1,000 charts at a time; you can publish more afterwards.</p>}
              </div>
            )}
            {seriesCharts.length > 0 && <div className="obs-share-list"><h3>Interactive charts</h3>{seriesCharts.map(chart => <label key={chart.id}><input type="checkbox" checked={selectedCharts.includes(chart.id)} disabled={selectedCharts.length >= 1000 && !selectedCharts.includes(chart.id)} onChange={event => setSelectedCharts(items => event.target.checked ? [...items,chart.id] : items.filter(id => id !== chart.id))}/><span>{chart.title}<small>Publish all currently recorded points</small></span></label>)}{nextSeriesOffset !== null && <button type="button" className="obs-link-button" onClick={async () => {try {const response=await fetch(`/api/research/series?campaign_id=${encodeURIComponent(data.campaign.id)}&limit=50&offset=${nextSeriesOffset}`);const body=await response.json();if(!response.ok)throw new Error(body.error || "Unable to load charts.");setSeriesCharts(items=>[...items,...body.charts.filter((chart:{id:string})=>!items.some(item=>item.id===chart.id))]);setNextSeriesOffset(body.next_offset ?? null);}catch(cause){setError(cause instanceof Error?cause.message:"Unable to load charts.");}}}>Load more interactive charts</button>}</div>}
            {tables.length > 0 && <div className="obs-share-list">
              <h3>Comparison tables</h3>
              {tables.map((table) => <label key={table.id}>
                <input type="checkbox" checked={selectedTables.includes(table.id)} disabled={selectedTables.length >= 30 && !selectedTables.includes(table.id)} onChange={(event) => setSelectedTables((items) => event.target.checked ? [...items, table.id] : items.filter((id) => id !== table.id))} />
                <span>{table.title}<small>Include this table</small></span>
              </label>)}
              {nextTableOffset !== null && <button type="button" className="obs-link-button" onClick={async () => {try {const response=await fetch(`/api/research/tables?campaign_id=${encodeURIComponent(data.campaign.id)}&limit=30&offset=${nextTableOffset}`);const body=await response.json();if(!response.ok)throw new Error(body.error || "Unable to load tables.");setTables(items=>[...items,...body.tables.filter((table:ComparisonTableData)=>!items.some(item=>item.id===table.id))]);setNextTableOffset(body.next_offset ?? null);}catch(cause){setError(cause instanceof Error?cause.message:"Unable to load tables.");}}}>Load more tables</button>}
              {selectedTables.length >= 30 && <p className="obs-muted">Publish up to 30 tables at a time; you can publish more afterwards.</p>}
            </div>}
            <label className="obs-share-acknowledgement">
              <input
                type="checkbox"
                required
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>
                I reviewed the selected experiments, charts, tables, and campaign
                summary and approve making them public.
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
                {selected.length} experiments · {selectedCharts.length} charts · {selectedTables.length} tables
                selected
              </span>
              <button
                className="obs-button obs-primary"
                disabled={
                  busy ||
                  (!selected.length && !selectedCharts.length && !selectedTables.length) ||
                  !acknowledged ||
                  loadingCharts
                }
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

export function HypothesisPanel({ data }: { data: Snapshot }) {
  const [selectedId, setSelectedId] = useState("");
  const [selectedExperiment, setSelectedExperiment] = useState("");
  const [selectedObservation, setSelectedObservation] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const selected = data.hypotheses.find(
    (hypothesis) => hypothesis.id === selectedId,
  );
  const experimentDetail = data.experiments.find(item => item.id === selectedExperiment);
  const observationDetail = data.observations.find(item => item.id === selectedObservation);
  const unlinked = data.experiments.filter(experiment => !data.hypotheses.some(hypothesis => hypothesis.id === experiment.hypothesis_id));
  const depth = (hypothesis: Hypothesis, seen = new Set<string>()): number => {
    if (!hypothesis.parent_hypothesis_id || seen.has(hypothesis.id)) return 0;
    seen.add(hypothesis.id);
    const parent = data.hypotheses.find(
      (item) => item.id === hypothesis.parent_hypothesis_id,
    );
    return parent ? 1 + depth(parent, seen) : 0;
  };
  const matching = data.hypotheses.filter(hypothesis => `${hypothesis.title} ${hypothesis.statement} ${data.experiments.filter(item => item.hypothesis_id === hypothesis.id).map(item => item.title).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const rows: Record<number, number> = {};
  const positions = matching.map((hypothesis) => {
    const column = depth(hypothesis);
    const experiments = data.experiments.filter(item => item.hypothesis_id === hypothesis.id);
    const shown = expanded.includes(hypothesis.id) ? experiments : experiments.slice(0, 2);
    const row = rows[column] || 25;
    const height = 112 + shown.length * 76 + (experiments.length > 2 ? 34 : 0);
    rows[column] = row + height + 25;
    return { hypothesis, experiments, shown, x: column * 310 + 25, y: row, height };
  });
  const width = Math.max(0, ...positions.map((position) => position.x)) + 300,
    height = Math.max(280, ...positions.map((position) => position.y + position.height + 25));
  return (
    <div className="obs-hypothesis-layout">
      <section className="obs-card">
        <div className="obs-card-heading">
          <div>
            <h2>Research map</h2>
            <p className="obs-muted">Choose a hypothesis, experiment, or observation to explore it.</p>
          </div>
          <span className="obs-subtle-label">
            {data.hypotheses.length} total
          </span>
        </div>
        <label className="obs-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search the research map" aria-label="Search the research map" /></label>
        {!data.hypotheses.length && <p className="obs-muted">No hypotheses yet. Connect an agent to add a testable idea.</p>}
        {(data.hypotheses.length >= 300 || data.experiments.length >= 500 || data.observations.length >= 3000) && <p className="obs-muted">This map shows a limited snapshot. Use the campaign tools to retrieve additional records.</p>}
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
                      d={`M${parent.x + 265},${parent.y + 38} C${parent.x + 285},${parent.y + 38} ${position.x - 25},${position.y + 38} ${position.x},${position.y + 38}`}
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
            {positions.map(({ hypothesis, experiments, shown, x, y, height }) => (
              <div
                className={`obs-hypothesis-node ${hypothesis.id === selectedId ? "selected" : ""}`}
                style={{ left: x, top: y, height }}
                key={hypothesis.id}
              >
                <button type="button" className="obs-map-hypothesis" onClick={() => { setSelectedId(hypothesis.id); setSelectedExperiment(""); setSelectedObservation(""); }} aria-pressed={hypothesis.id === selectedId && !selectedExperiment && !selectedObservation}>
                  <Badge status={hypothesis.status} />
                  <strong>{hypothesis.title || hypothesis.statement}</strong>
                  <small>{experiments.length} {experiments.length === 1 ? "experiment" : "experiments"}</small>
                </button>
                {shown.map(experiment => {
                  const runIds = new Set(data.runs.filter(run => run.experiment_id === experiment.id).map(run => run.id));
                  const observations = data.observations.filter(observation => runIds.has(observation.run_id));
                  const latest = observations.at(-1);
                  return <div className="obs-map-experiment" key={experiment.id}>
                    <button type="button" onClick={() => {setSelectedId(hypothesis.id); setSelectedExperiment(experiment.id); setSelectedObservation("");}} aria-pressed={selectedExperiment === experiment.id}><FlaskConical size={14} /> <span>{experiment.title}</span></button>
                    {latest ? <button type="button" className="obs-map-observation" onClick={() => {setSelectedId(hypothesis.id); setSelectedExperiment(""); setSelectedObservation(latest.id);}} aria-pressed={selectedObservation === latest.id}>{data.metrics.find(metric => metric.id === latest.metric_id)?.name || "Observation"}: {latest.value == null ? "See note" : `${numeric(latest.value)} ${latest.unit || ""}`} · {observations.length} total</button> : <small>No observations yet</small>}
                  </div>;
                })}
                {experiments.length > 2 && <button type="button" className="obs-map-more" onClick={() => setExpanded(items => items.includes(hypothesis.id) ? items.filter(id => id !== hypothesis.id) : [...items,hypothesis.id])}>{expanded.includes(hypothesis.id) ? "Show less" : `Show ${experiments.length - 2} more`}</button>}
              </div>
            ))}
          </div>
        </div>
        {unlinked.length > 0 && <div className="obs-map-unlinked"><h3>Other experiments</h3><p className="obs-muted">These experiments have no hypothesis in the visible map.</p>{unlinked.filter(item => item.title.toLowerCase().includes(query.toLowerCase())).map(experiment => <button key={experiment.id} className="obs-link-button" onClick={() => {setSelectedId(""); setSelectedObservation(""); setSelectedExperiment(experiment.id);}}>{experiment.title} <ChevronRight size={15}/></button>)}</div>}
      </section>
      {observationDetail ? (
        <section className="obs-card obs-detail"><div className="obs-card-heading"><h2>Observation</h2><button className="obs-icon-button" onClick={() => setSelectedObservation("")} aria-label="Close observation detail"><X size={18} /></button></div>
          <DataText label="Measurement">{observationDetail.value == null ? "Qualitative observation" : `${numeric(observationDetail.value)} ${observationDetail.unit || ""}`}</DataText>
          <DataText label="Notes">{observationDetail.qualitative}</DataText><DataText label="Conditions">{observationDetail.conditions_key}</DataText><DataText label="Evidence">{observationDetail.evidence}</DataText><DataText label="Uncertainty">{observationDetail.uncertainty}</DataText><p>Sample size: {observationDetail.sample_size ?? "not reported"} · {date(observationDetail.created_at)}</p>
        </section>
      ) : experimentDetail ? (
        <ExperimentDetail experiment={experimentDetail} data={data} onClose={() => setSelectedExperiment("")} />
      ) : selected ? (
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
