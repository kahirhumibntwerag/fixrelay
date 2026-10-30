"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Campaign, Snapshot } from "./types";
import {
  ActivityPanel,
  ExperimentPanel,
  HypothesisPanel,
  OverviewPanel,
  ReviewPanel,
} from "./panels";

type Tab = "overview" | "hypotheses" | "experiments" | "activity" | "review";
const tabs = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "hypotheses", label: "Hypotheses", icon: GitBranch },
  { id: "experiments", label: "Experiments", icon: FlaskConical },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "review", label: "Review", icon: ShieldCheck },
] as const;

async function responseData(response: Response) {
  const body = await response
    .json()
    .catch(() => ({ error: "The server returned an unreadable response." }));
  if (!response.ok) {
    const details = Array.isArray(body.issues)
      ? body.issues
          .slice(0, 3)
          .map(
            (issue: { path: string; message: string }) =>
              `${issue.path}: ${issue.message}`,
          )
          .join("; ")
      : "";
    throw new Error(
      details || body.error || "Unable to load this research workspace.",
    );
  }
  return body;
}

export function Observatory({
  initialCampaign,
}: {
  userName: string;
  initialCampaign?: string;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState(initialCampaign || "");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedExperiment, setSelectedExperiment] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<
    "connecting" | "live" | "reconnecting"
  >("connecting");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const version = useRef(0);
  const load = useCallback(async (id: string) => {
    const currentVersion = ++version.current;
    try {
      const data = await responseData(
        await fetch(`/api/research?campaign_id=${encodeURIComponent(id)}`, {
          cache: "no-store",
        }),
      );
      if (currentVersion === version.current) {
        setSnapshot(data);
        setError("");
      }
    } catch (cause) {
      if (currentVersion === version.current)
        setError(
          cause instanceof Error ? cause.message : "Unable to load campaign.",
        );
    } finally {
      if (currentVersion === version.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/research", { cache: "no-store", signal: controller.signal })
      .then(responseData)
      .then((data) => {
        setCampaigns(data.campaigns || []);
        setCampaignId((current) => current || data.campaigns?.[0]?.id || "");
        if (!data.campaigns?.length) setLoading(false);
        setError("");
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    if (!campaignId) return;
    setLoading(true);
    setSnapshot(null);
    setConnection("connecting");
    void load(campaignId);
    window.history.replaceState(
      null,
      "",
      `/observatory?campaign=${encodeURIComponent(campaignId)}`,
    );
    const source = new EventSource(
      `/api/research/events?campaign_id=${encodeURIComponent(campaignId)}`,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      setConnection("live");
      clearTimeout(timer);
      timer = setTimeout(() => void load(campaignId), 350);
    };
    source.onopen = () => setConnection("live");
    source.addEventListener("research", update);
    source.onmessage = update;
    source.onerror = () => setConnection("reconnecting");
    // A bounded refresh also recovers from dropped stream connections on serverless hosts.
    const poll = setInterval(() => void load(campaignId), 20000);
    return () => {
      version.current++;
      source.close();
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, [campaignId, load]);

  const refresh = () => {
    if (campaignId) void load(campaignId);
    else setRefreshKey((key) => key + 1);
  };
  const created = (campaign: Campaign) => {
    setCampaigns((items) => [campaign, ...items]);
    setCampaignId(campaign.id);
    setCreating(false);
    setTab("overview");
  };
  function navigateTab(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((item) => item.id === tab);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(`tab-${tabs[next].id}`)?.focus();
  }
  return (
    <div className="observatory">
      <div className="obs-heading">
        <h1>Research observatory</h1>
        <div className="obs-inline obs-header-actions">
          <button
            className="obs-button obs-primary"
            onClick={() => setCreating(!creating)}
          >
            <Plus size={16} /> New campaign
          </button>
          <details className="obs-actions-menu">
            <summary>More</summary>
            <div>
              <Link href="/settings">
                Account and agents <ArrowUpRight size={16} />
              </Link>
              <button
                onClick={(event) => {
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                  setImporting(!importing);
                }}
              >
                Import campaign
              </button>
            </div>
          </details>
        </div>
      </div>
      {creating && (
        <CampaignForm onClose={() => setCreating(false)} onCreated={created} />
      )}
      {importing && (
        <CampaignImport
          onClose={() => setImporting(false)}
          onImported={(id) => {
            setCampaignId(id);
            setRefreshKey((key) => key + 1);
            setImporting(false);
          }}
        />
      )}
      {error && (
        <div className="obs-alert" role="alert">
          <span>{error}</span>
          <button className="obs-button" onClick={refresh}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}
      {campaigns.length > 0 && (
        <div className="obs-campaign-bar">
          <label>
            Campaign
            <select
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
            >
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.title}
                </option>
              ))}
            </select>
          </label>
          <div
            className={`obs-live obs-live-${connection}`}
            role="status"
            aria-live="polite"
          >
            <span />
            {connection === "live"
              ? "Live"
              : connection === "reconnecting"
                ? "Reconnecting…"
                : "Connecting…"}
          </div>
          <button
            className="obs-icon-button"
            aria-label="Refresh campaign"
            onClick={refresh}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      )}
      {loading && (
        <div className="obs-empty" role="status">
          <div className="obs-loader" />
          <h2>Loading research…</h2>
        </div>
      )}
      {!loading && !campaigns.length && !error && !creating && (
        <div className="obs-empty">
          <div className="obs-empty-icon">
            <FlaskConical size={30} />
          </div>
          <h2>No campaigns yet</h2>
          <p>
            Create a campaign to track your research question and experiments.
          </p>
          <button
            className="obs-button obs-primary"
            onClick={() => setCreating(true)}
          >
            <Plus size={16} /> Create your first campaign
          </button>
          <Link href="/campaigns" className="obs-text-link">
            Explore shared research <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      {!loading && snapshot && (
        <>
          <div
            className="obs-tabs"
            role="tablist"
            aria-label="Campaign views"
            onKeyDown={navigateTab}
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                role="tab"
                tabIndex={tab === item.id ? 0 : -1}
                aria-selected={tab === item.id}
                aria-controls={`panel-${item.id}`}
                className={tab === item.id ? "active" : ""}
                onClick={() => setTab(item.id)}
              >
                <item.icon size={16} />
                {item.label}
                {item.id === "review" &&
                  snapshot.summary.pending_reviews > 0 && (
                    <span className="obs-count">
                      {snapshot.summary.pending_reviews}
                    </span>
                  )}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "overview" && (
              <OverviewPanel
                data={snapshot}
                onNavigate={setTab}
                onUpdated={refresh}
                onInspectExperiment={(id) => {
                  setSelectedExperiment(id);
                  setTab("experiments");
                }}
              />
            )}
            {tab === "hypotheses" && <HypothesisPanel data={snapshot} />}
            {tab === "experiments" && (
              <ExperimentPanel
                data={snapshot}
                initialSelected={selectedExperiment}
              />
            )}
            {tab === "activity" && <ActivityPanel data={snapshot} />}
            {tab === "review" && (
              <ReviewPanel data={snapshot} onUpdated={refresh} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CampaignImport({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef({ payload: "", key: "" });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget),
      input = {
        campaign_id: String(form.get("campaign_id") || "").trim(),
        access_token: String(form.get("access_token") || "").trim(),
      };
    const payload = JSON.stringify(input);
    if (attempt.current.payload !== payload)
      attempt.current = { payload, key: crypto.randomUUID() };
    try {
      const result = await responseData(
        await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "claim_campaign",
            input,
            idempotency_key: attempt.current.key,
          }),
        }),
      );
      onImported(result.id || result.campaign_id || input.campaign_id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to import campaign.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="obs-card obs-campaign-form" onSubmit={submit}>
      <div className="obs-card-heading">
        <h2>Import an existing campaign</h2>
        <button
          type="button"
          className="obs-icon-button"
          onClick={onClose}
          aria-label="Close import form"
        >
          <X size={19} />
        </button>
      </div>
      <p className="obs-muted">
        Link a campaign created before sign-in using its original access token.
      </p>
      <div className="obs-form-grid">
        <label>
          Campaign ID
          <input
            name="campaign_id"
            required
            maxLength={36}
            placeholder="Enter the campaign ID"
          />
        </label>
        <label>
          Original access token
          <input
            type="password"
            name="access_token"
            required
            autoComplete="off"
            minLength={24}
            maxLength={200}
            placeholder="Enter the original access token"
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
          {busy ? "Importing…" : "Import campaign"}
        </button>
      </div>
    </form>
  );
}

function CampaignForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (campaign: Campaign) => void;
}) {
  const [direction, setDirection] = useState("maximize"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef({ payload: "", key: "" });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget),
      text = (key: string) => String(form.get(key) || "").trim();
    const input = {
      title: text("title"),
      question: text("question"),
      summary: text("objective"),
      objective: text("objective"),
      constraints: text("constraints"),
      stop_conditions: text("stop_conditions"),
      metric: {
        name: text("metric_name"),
        unit: text("unit"),
        direction,
        ...(text("baseline") ? { baseline: Number(text("baseline")) } : {}),
        target: Number(text("target")),
        ...(direction === "range"
          ? { target_max: Number(text("target_max")) }
          : {}),
        evaluation_protocol: text("evaluation_protocol"),
      },
    };
    const payload = JSON.stringify(input);
    if (attempt.current.payload !== payload)
      attempt.current = { payload, key: crypto.randomUUID() };
    try {
      const data = await responseData(
        await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create_campaign",
            input,
            idempotency_key: attempt.current.key,
          }),
        }),
      );
      const id = data.id || data.campaign?.id;
      if (!id)
        throw new Error(
          "Campaign saved without an identifier; refresh the workspace.",
        );
      onCreated({ ...input, id, visibility: "private", status: "active" });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create campaign.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="obs-card obs-campaign-form" onSubmit={submit}>
      <div className="obs-card-heading">
        <h2>New campaign</h2>
        <button
          type="button"
          className="obs-icon-button"
          onClick={onClose}
          aria-label="Close campaign form"
        >
          <X size={19} />
        </button>
      </div>
      <p className="obs-muted">Campaigns are private until you share them.</p>
      <div className="obs-form-grid">
        <label className="obs-span-two">
          Campaign title
          <input
            name="title"
            minLength={8}
            maxLength={180}
            required
            placeholder="e.g. Improving solar image reconstruction"
          />
        </label>
        <label className="obs-span-two">
          Research question
          <textarea
            name="question"
            minLength={20}
            maxLength={1500}
            required
            placeholder="What do you want to discover?"
          />
        </label>
        <label className="obs-span-two">
          Objective
          <textarea
            name="objective"
            minLength={20}
            maxLength={2000}
            required
            placeholder="What result would answer your question?"
          />
        </label>
        <label>
          Primary metric
          <input
            name="metric_name"
            required
            maxLength={100}
            placeholder="e.g. PSNR"
          />
        </label>
        <label>
          Unit
          <input name="unit" maxLength={40} placeholder="e.g. dB" />
        </label>
        <label>
          Goal
          <select
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
          >
            <option value="maximize">Higher is better</option>
            <option value="minimize">Lower is better</option>
            <option value="range">Within a target range</option>
          </select>
        </label>
        <label>
          Baseline (optional)
          <input name="baseline" type="number" step="any" />
        </label>
        <label>
          {direction === "range" ? "Target minimum" : "Target"}
          <input name="target" type="number" step="any" required />
        </label>
        {direction === "range" && (
          <label>
            Target maximum
            <input name="target_max" type="number" step="any" required />
          </label>
        )}
        <label className="obs-span-two">
          How to measure results
          <textarea
            name="evaluation_protocol"
            minLength={10}
            maxLength={4000}
            required
            placeholder="Describe the data and method used to measure this metric."
          />
        </label>
        <label>
          Constraints (optional)
          <textarea
            name="constraints"
            maxLength={4000}
            placeholder="Budget, time, data, or resource limits"
          />
        </label>
        <label>
          When to stop (optional)
          <textarea
            name="stop_conditions"
            maxLength={4000}
            placeholder="When should the agent stop or ask you?"
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
          {busy ? "Creating…" : "Create private campaign"}
        </button>
      </div>
    </form>
  );
}
