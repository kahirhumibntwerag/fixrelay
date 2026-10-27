"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { ExperimentDetail } from "@/components/experiment-detail";
import {
  CampaignView,
  type CampaignViewData,
} from "@/components/campaign-view";
import type { Experiment } from "@/lib/experiments";
type Row = {
  id: string;
  title: string;
  question: string;
  visibility: string;
  status?: string;
};
export default function PrivateWorkspace() {
  const [token, setToken] = useState(""),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState<"experiments" | "campaigns">("campaigns"),
    [records, setRecords] = useState<Row[]>([]),
    [selected, setSelected] = useState<Experiment | null>(null),
    [campaign, setCampaign] = useState<CampaignViewData | null>(null),
    [offset, setOffset] = useState(0),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [loadingId, setLoadingId] = useState<string | null>(null),
    [error, setError] = useState("");
  const generation = useRef(0);
  const resultsScroll = useRef(0);
  const campaignScroll = useRef(0);
  const previousRecord = useRef<string | null>(null);
  function clear() {
    generation.current++;
    setRecords([]);
    setSelected(null);
    setCampaign(null);
    setLoaded(false);
    setError("");
    setBusy(false);
    setLoadingId(null);
  }
  async function read(next = 0, id?: string, requestedKind = kind) {
    const ticket = ++generation.current;
    if (id) {
      setLoadingId(id);
      previousRecord.current = id;
      if (!campaign)
        resultsScroll.current = document.querySelector("main")?.scrollTop || 0;
      else if (requestedKind === "experiments")
        campaignScroll.current = document.querySelector("main")?.scrollTop || 0;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/experiments/private", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: token,
          query,
          offset: next,
          id,
          kind: requestedKind,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (ticket !== generation.current) return;
      if (!res.ok) throw new Error(data.error);
      if (id) {
        if (requestedKind === "campaigns") {
          const paging = Boolean(campaign);
          setCampaign(data.campaign);
          setSelected(null);
          requestAnimationFrame(() =>
            (paging
              ? document.getElementById("campaign-experiments")
              : document.getElementById("workspace-content")
            )?.scrollIntoView({ block: "start" }),
          );
        } else {
          setSelected(data.experiment);
          requestAnimationFrame(() => {
            const content = document.getElementById("workspace-content");
            content?.scrollIntoView({ block: "start" });
            content?.focus({ preventScroll: true });
          });
        }
      } else {
        setRecords(data.campaigns || data.experiments);
        setSelected(null);
        setCampaign(null);
        setOffset(next);
        setLoaded(true);
      }
    } catch (e) {
      if (ticket === generation.current) {
        setError(e instanceof Error ? e.message : "Unable to load records");
        requestAnimationFrame(() =>
          document.getElementById("workspace-error")?.focus(),
        );
      }
    } finally {
      if (ticket === generation.current) {
        setBusy(false);
        setLoadingId(null);
      }
    }
  }
  return (
    <div className="content article">
      <div className="eyebrow">
        <span />
        PRIVATE PROJECT WORKSPACE
      </div>
      <h1>
        Your campaigns.
        <br />
        <span>Your access token.</span>
      </h1>
      <p className="intro">
        Use the token from create_campaign or register_experiment. It stays in
        page memory and is sent in POST bodies, never the URL. Reloading clears
        it.
      </p>
      <form
        className="private-form"
        onSubmit={(e) => {
          e.preventDefault();
          void read();
        }}
      >
        <label>
          Project access token
          <input
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              clear();
            }}
            autoComplete="off"
            minLength={32}
            maxLength={128}
            pattern="(?:[A-Za-z0-9_]|-){32,128}"
            title="Use 32 to 128 letters, numbers, underscores or hyphens."
            aria-describedby="private-token-hint"
            required
          />
        </label>
        <label>
          Record type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              clear();
            }}
          >
            <option value="campaigns">Campaigns</option>
            <option value="experiments">Experiments</option>
          </select>
        </label>
        <label>
          Search within your project
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={500}
          />
        </label>
        <div className="hero-actions">
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Loading…" : "Open workspace"}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setToken("");
              clear();
            }}
          >
            Clear token and records
          </button>
        </div>
      </form>
      <p className="muted small" id="private-token-hint">
        Use 32–128 letters, numbers, underscores or hyphens. Anyone with this
        token controls its project records. Keep it private; lost tokens cannot
        be recovered.
      </p>
      {error && (
        <p
          className="trust-note"
          id="workspace-error"
          tabIndex={-1}
          role="alert"
        >
          {error}
        </p>
      )}
      <div id="workspace-content" tabIndex={-1}>
        {selected ? (
          <>
            <button
              className="text-link plain-button"
              onClick={() => {
                setSelected(null);
                requestAnimationFrame(() => {
                  const main = document.querySelector("main");
                  main?.scrollTo({
                    top: campaign
                      ? campaignScroll.current
                      : resultsScroll.current,
                  });
                  const attr = campaign
                    ? "data-experiment-id"
                    : "data-workspace-id";
                  if (previousRecord.current)
                    main
                      ?.querySelector<HTMLButtonElement>(
                        `[${attr}="${CSS.escape(previousRecord.current)}"]`,
                      )
                      ?.focus({ preventScroll: true });
                });
              }}
            >
              ← {campaign ? "Campaign trail" : "Workspace results"}
            </button>
            <ExperimentDetail record={selected} />
          </>
        ) : campaign ? (
          <>
            <button
              className="text-link plain-button"
              onClick={() => {
                setCampaign(null);
                requestAnimationFrame(() =>
                  document
                    .querySelector("main")
                    ?.scrollTo({ top: resultsScroll.current }),
                );
              }}
            >
              ← Workspace results
            </button>
            <CampaignView
              data={campaign}
              loadingExperimentId={loadingId}
              loadingPage={busy && loadingId === campaign.campaign.id}
              onExperiment={(id) => void read(0, id, "experiments")}
              onPage={(n) => void read(n, campaign.campaign.id, "campaigns")}
            />
          </>
        ) : (
          <>
            {records.map((r) => (
              <button
                className="report-card workspace-result"
                key={r.id}
                data-workspace-id={r.id}
                disabled={busy}
                onClick={() => void read(0, r.id)}
              >
                <span className="solved">
                  {r.status || "campaign"} · {r.visibility}
                </span>
                <h3>
                  {loadingId === r.id ? `Loading ${r.title}…` : `${r.title} ↗`}
                </h3>
                <p>{r.question}</p>
              </button>
            ))}
            {loaded && !records.length && (
              <div className="empty">
                No matching records. Check your token or search terms.
              </div>
            )}
            {loaded && (
              <div className="pagination">
                {offset > 0 && (
                  <button onClick={() => void read(Math.max(0, offset - 20))}>
                    ← Previous
                  </button>
                )}
                {records.length === 20 && (
                  <button onClick={() => void read(offset + 20)}>Next →</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <p className="muted">
        <Link href="/connect">Connect your agent</Link> to create campaigns and
        submit reproduction reports.
      </p>
    </div>
  );
}
