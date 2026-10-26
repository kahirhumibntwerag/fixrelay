"use client";
import { useState, useRef } from "react";
import { CampaignView, type CampaignViewData } from "./campaign-view";
import { ExperimentDetail } from "./experiment-detail";
import type { Experiment } from "@/lib/experiments";
export function CampaignReader({ initial }: { initial: CampaignViewData }) {
  const [data, setData] = useState(initial),
    [token, setToken] = useState(""),
    [privateView, setPrivateView] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Experiment | null>(null);
  const generation = useRef(0);
  function clear() {
    generation.current++;
    setData(initial);
    setToken("");
    setPrivateView(false);
    setSelected(null);
    setBusy(false);
    setError("");
  }
  async function read(
    kind: "campaigns" | "experiments",
    id: string,
    offset = 0,
  ) {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/experiments/private", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, id, offset, access_token: token }),
          cache: "no-store",
        }),
        body = await res.json();
      if (ticket !== generation.current) return;
      if (!res.ok) throw Error(body.error);
      if (kind === "campaigns") {
        setData(body.campaign);
        setPrivateView(true);
        setSelected(null);
      } else setSelected(body.experiment);
    } catch (e) {
      if (ticket === generation.current)
        setError(e instanceof Error ? e.message : "Unable to load evidence");
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  return (
    <>
      <div className="evidence-access">
        <details>
          <summary>Have private reproduction reports?</summary>
          <p>
            Public status includes public reports only. Enter the report owner’s
            access token to include its private evidence. A campaign token does
            not grant access to another contributor’s private reports. Their
            owner must publish them to make them count toward public status.
          </p>
          <form
            className="private-form"
            onSubmit={(e) => {
              e.preventDefault();
              void read("campaigns", initial.campaign.id);
            }}
          >
            <label>
              Report or project access token
              <input
                type="password"
                value={token}
                autoComplete="off"
                required
                minLength={32}
                maxLength={128}
                onChange={(e) => {
                  generation.current++;
                  setToken(e.target.value);
                  setPrivateView(false);
                  setData(initial);
                  setSelected(null);
                  setError("");
                  setBusy(false);
                }}
              />
            </label>
            <button className="button secondary" disabled={busy}>
              {busy ? "Loading…" : "View accessible evidence"}
            </button>
          </form>
          <p className="muted small">
            Token stays in page memory and POST bodies. Reload or clear to
            remove it. Private evidence remains private.
          </p>
        </details>
        {privateView && (
          <p role="status">
            Viewing evidence accessible to this token.{" "}
            <button className="text-link plain-button" onClick={clear}>
              Clear token and return to public view
            </button>
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      {selected ? (
        <>
          <button
            className="text-link plain-button"
            onClick={() => setSelected(null)}
          >
            ← Back to campaign experiments
          </button>
          <ExperimentDetail record={selected} />
        </>
      ) : (
        <CampaignView
          data={data}
          onExperiment={
            privateView ? (id) => void read("experiments", id) : undefined
          }
          onPage={
            privateView
              ? (offset) => void read("campaigns", initial.campaign.id, offset)
              : undefined
          }
        />
      )}
    </>
  );
}
