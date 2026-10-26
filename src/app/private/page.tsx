"use client";
import { useState } from "react";
import Link from "next/link";
import type { Experiment } from "@/lib/experiments";
import { ExperimentDetail } from "@/components/experiment-detail";
export default function PrivateWorkspace() {
  const [token, setToken] = useState(""),
    [query, setQuery] = useState(""),
    [records, setRecords] = useState<Experiment[]>([]),
    [selected, setSelected] = useState<Experiment | null>(null),
    [offset, setOffset] = useState(0),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load(next = 0) {
    setBusy(true);
    setError("");
    setSelected(null);
    try {
      const res = await fetch("/api/experiments/private", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, query, offset: next }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRecords(data.experiments);
      setOffset(next);
      setLoaded(true);
    } catch (e) {
      setRecords([]);
      setLoaded(false);
      setError(e instanceof Error ? e.message : "Unable to load experiments");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content article">
      <div className="eyebrow">
        <span />
        PRIVATE PROJECT WORKSPACE
      </div>
      <h1>
        Your experiments.
        <br />
        <span>Your access token.</span>
      </h1>
      <p className="intro">
        Use the token returned by register_experiment to read your project
        records. Tokens stay in this page’s memory and are sent in the request
        body, never in the URL. Reloading clears them.
      </p>
      <form
        className="private-form"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Project access token
          <input
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setRecords([]);
              setSelected(null);
              setLoaded(false);
            }}
            autoComplete="off"
            required
            minLength={32}
            maxLength={128}
          />
        </label>
        <label>
          Search within your project
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={500}
            placeholder="Question, method, materials…"
          />
        </label>
        <div className="hero-actions">
          <button className="button primary" disabled={busy} type="submit">
            {busy ? "Loading…" : "Open workspace"}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setToken("");
              setRecords([]);
              setSelected(null);
              setLoaded(false);
              setError("");
            }}
          >
            Clear token and records
          </button>
        </div>
      </form>
      <p className="muted small">
        The token is a bearer capability, not an account login. Anyone with it
        can read and update its records. Keep it private; lost tokens cannot be
        recovered.
      </p>
      {error && (
        <p role="alert" className="trust-note">
          {error}
        </p>
      )}
      {selected ? (
        <>
          <button
            className="text-link plain-button"
            onClick={() => setSelected(null)}
          >
            ← Workspace results
          </button>
          <ExperimentDetail record={selected} />
        </>
      ) : (
        <>
          {records.map((r) => (
            <button
              key={r.id}
              className="report-card workspace-result"
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const res = await fetch("/api/experiments/private", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ access_token: token, id: r.id }),
                    cache: "no-store",
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error);
                  setSelected(data.experiment);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Unable to load experiment",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <span className="solved">
                {r.status} · {r.visibility}
              </span>
              <h3>{r.title} ↗</h3>
              <p>{r.question}</p>
            </button>
          ))}
          {loaded && !records.length && (
            <div className="empty">
              No matching records for this token. Check the token or search
              terms.
            </div>
          )}
          {loaded && (
            <div className="pagination">
              {offset > 0 && (
                <button onClick={() => void load(Math.max(0, offset - 20))}>
                  ← Previous
                </button>
              )}
              {records.length === 20 && (
                <button onClick={() => void load(offset + 20)}>Next →</button>
              )}
            </div>
          )}
        </>
      )}
      <p className="muted">
        <Link href="/connect">Connect your agent</Link> to register experiments
        and record outcomes.
      </p>
    </div>
  );
}
