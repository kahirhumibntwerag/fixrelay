"use client";

import { useRef, useState } from "react";

type Kind = "metric" | "chart" | "comparison_table";

export function RemoveResearchItem({
  campaignId,
  id,
  name,
  kind,
  isPublic = false,
  primary = false,
  onRemoved,
}: {
  campaignId: string;
  id: string;
  name: string;
  kind: Kind;
  isPublic?: boolean;
  primary?: boolean;
  onRemoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef("");
  const label = kind === "comparison_table" ? "table" : kind;

  async function remove() {
    if (!key.current) key.current = crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: `remove_${kind}`,
          input: { campaign_id: campaignId, [`${kind === "comparison_table" ? "table" : kind}_id`]: id },
          idempotency_key: key.current,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Unable to remove ${label}.`);
      onRemoved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to remove ${label}.`);
    } finally {
      setBusy(false);
    }
  }

  return <div className="obs-remove-item">
    {!open ? <button type="button" className="obs-link-button" onClick={() => setOpen(true)} aria-label={`Remove ${label}: ${name}`}>Remove {label}</button> : <div>
      <p>Remove “{name}”? {isPublic && "It will no longer be publicly visible. "}{primary && "The next metric will become primary. "}{kind === "comparison_table" ? "The original table remains in the campaign’s audit history." : "This cannot be undone; audit history remains."}</p>
      <div className="obs-form-actions">
        <button type="button" className="obs-button" onClick={() => { setOpen(false); setError(""); }} disabled={busy}>Cancel</button>
        <button type="button" className="obs-button" onClick={remove} disabled={busy}>{busy ? "Removing…" : `Remove ${label}`}</button>
      </div>
      {error && <p className="obs-form-error" role="alert">{error}</p>}
    </div>}
  </div>;
}
