"use client";

import { useEffect, useRef, useState } from "react";
import { ComparisonTable, type ComparisonTableData } from "@/components/comparison-table";
import type { Snapshot } from "./types";
import { RemoveResearchItem } from "./remove-research-item";

export function TablesPanel({ data, onUpdated }: { data: Snapshot; onUpdated: () => void }) {
  const [tables, setTables] = useState<ComparisonTableData[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const attempt = useRef({ payload: "", key: "" });
  const eventVersion = data.events.at(-1)?.id;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/research/tables?campaign_id=${encodeURIComponent(data.campaign.id)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to load tables."); return body; })
      .then((body) => { setTables(body.tables); setNextOffset(body.next_offset ?? null); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load tables."); });
    return () => controller.abort();
  }, [data.campaign.id, eventVersion]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const lines = String(fields.get("data") || "").replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim());
    const [columns, ...rows] = lines.map((line) => line.split("\t").map((cell) => cell.trim()));
    if (!columns || columns.length < 2 || !rows.length || rows.some((row) => row.length !== columns.length)) {
      setError("Paste a header and at least one row, with the same number of tab-separated cells on each line."); return;
    }
    const input = { campaign_id: data.campaign.id, title: String(fields.get("title") || ""), caption: String(fields.get("caption") || ""), columns, rows };
    const payload = JSON.stringify(input);
    if (attempt.current.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_comparison_table", input, idempotency_key: attempt.current.key }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save table.");
      form.reset(); setOpen(false); setSuccess("Table saved privately. Select it under Publish findings to share it."); onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save table."); }
    finally { setBusy(false); }
  }
  return <section className="obs-card">
    <div className="obs-card-heading"><h2>Comparison tables</h2><button className="obs-link-button" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Close" : "Add table"}</button></div>
    {open && <form className="obs-chart-form" onSubmit={save}>
      <div className="obs-form-grid">
      <label className="obs-span-two">Title<input name="title" required maxLength={200} /></label>
      <label className="obs-span-two">Caption (optional)<textarea name="caption" maxLength={6000} placeholder="Describe units, conditions and sources." /></label>
      <label className="obs-span-two">Table data<textarea name="data" required rows={7} placeholder={"Model\tAccuracy\tLatency\nBaseline\t82%\t30 ms\nCandidate\t87%\t25 ms"} /></label>
      </div>
      <p className="obs-upload-hint">Paste cells copied from a spreadsheet, including a header row. Up to 20 columns and 100 rows.</p>
      <button className="obs-button obs-primary" disabled={busy}>{busy ? "Saving…" : "Save private table"}</button>
    </form>}
    {error && <p className="obs-form-error" role="alert">{error}</p>}
    {success && <p className="obs-chart-success" role="status">{success}</p>}
    {tables.map((table) => <div key={table.id}><ComparisonTable table={table} /><p className="obs-muted">{table.is_public ? "Published version is public; new versions stay private until published." : "Private"}</p><TableVersionForm table={table} campaignId={data.campaign.id} onSaved={onUpdated} />{data.campaign.role === "owner" && <RemoveResearchItem campaignId={data.campaign.id} id={table.id} name={table.title} kind="comparison_table" isPublic={table.is_public} onRemoved={() => { setTables((items) => items.filter((item) => item.id !== table.id)); setSuccess("Table removed."); onUpdated(); }} />}</div>)}
    {nextOffset !== null && <button className="obs-link-button" type="button" onClick={async () => {
      try { const response = await fetch(`/api/research/tables?campaign_id=${encodeURIComponent(data.campaign.id)}&offset=${nextOffset}`); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to load tables."); setTables(items => [...items, ...body.tables.filter((table: ComparisonTableData) => !items.some(item => item.id === table.id))]); setNextOffset(body.next_offset ?? null); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load tables."); }
    }}>Load more tables</button>}
    {!tables.length && <p className="obs-muted">Add a table to compare results alongside your metrics.</p>}
  </section>;
}

function TableVersionForm({table, campaignId, onSaved}: {table: ComparisonTableData; campaignId: string; onSaved: () => void}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const attempt = useRef({payload: "", key: ""});
  const latest = table.versions?.at(-1) ?? table;
  const initial = [latest.columns, ...latest.rows].map(row => row.map(cell => cell ?? "").join("\t")).join("\n");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const [columns, ...rows] = String(fields.get("data") || "").replace(/\r\n?/g,"\n").split("\n").filter(line => line.trim()).map(line => line.split("\t").map(cell => cell.trim()));
    if (!columns || columns.length < 2 || !rows.length || rows.some(row => row.length !== columns.length)) {setError("Each row needs the same number of cells as the header."); return;}
    const input = {campaign_id: campaignId, table_id: table.id, columns, rows, note: String(fields.get("note") || "")};
    const payload = JSON.stringify(input);
    if (attempt.current.payload !== payload) attempt.current = {payload, key: crypto.randomUUID()};
    setBusy(true); setError("");
    try {const response = await fetch("/api/research", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"add_comparison_table_version",input,idempotency_key:attempt.current.key})}); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to save version."); setOpen(false); onSaved();}
    catch (cause) {setError(cause instanceof Error ? cause.message : "Unable to save version.");} finally {setBusy(false);}
  }
  return <div><button type="button" className="obs-link-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Cancel update" : "Add a version"}</button>{open && <form className="obs-chart-form" onSubmit={save}>
    <label>Table data<textarea name="data" required rows={7} defaultValue={initial} /></label>
    <label>What changed? (optional)<input name="note" maxLength={6000} /></label>
    <p className="obs-upload-hint">Keep the first column and column names consistent to compare versions. The new version remains private until you publish it.</p>
    {error && <p role="alert" className="obs-form-error">{error}</p>}<button className="obs-button obs-primary" disabled={busy}>{busy ? "Saving…" : "Save version"}</button>
  </form>}</div>;
}
