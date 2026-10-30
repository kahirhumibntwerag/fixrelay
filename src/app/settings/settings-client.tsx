"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import "@/components/auth.css";

type AgentKey = { id: string; name: string; campaign_id: string | null; campaign_title: string | null; created_at: string; revoked_at: string | null };
type Campaign = { id: string; title: string };

export function AgentKeySettings({ name }: { name: string }) {
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  async function load() {
    const response = await fetch("/api/agent-keys", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load credentials.");
    setKeys(data.keys);
    setCampaigns(data.campaigns);
  }
  useEffect(() => { let active = true; fetch("/api/agent-keys", { cache: "no-store" }).then(async response => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load credentials.");
    if (active) { setKeys(data.keys); setCampaigns(data.campaigns); }
  }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setError(""); setToken(""); setCopied(false);
    try {
      const response = await fetch("/api/agent-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: values.get("name"), campaign_id: values.get("campaign_id") || null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setToken(data.token); form.reset(); await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to create credential."); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/agent-keys", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to revoke credential."); }
    finally { setBusy(false); }
  }
  return <div className="auth-settings"><span className="auth-eyebrow">ACCOUNT SETTINGS</span><h1>{name}’s workspace</h1><p>Give each research agent its own credential. Agents can record research and request review; approvals require your signed-in account.</p><section className="auth-settings-card"><h2>Connect a research agent</h2><p>Choose one campaign, or allow access to the campaigns you belong to. A workspace credential can also create your first campaign.</p><form className="auth-form" onSubmit={create}><label>Agent name<input name="name" placeholder="e.g. Solar research agent" minLength={2} maxLength={80} required /></label><label>Campaign access<select name="campaign_id" defaultValue=""><option value="">My workspace — create and access my campaigns</option>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}</select></label><button className="button" type="submit" disabled={busy || loading}>{busy ? "Please wait…" : "Create agent credential"}</button></form>{token && <div className="auth-new-key" role="status"><strong>Save this credential now</strong><p>It is displayed once. Put it in your agent’s private environment and send it as an Authorization: Bearer header.</p><code>{token}</code><button type="button" className="auth-copy" onClick={async () => { try { await navigator.clipboard.writeText(token); setCopied(true); } catch { setError("Copy the credential manually from the field above."); } }}>{copied ? "Copied" : "Copy credential"}</button></div>}{error && <p className="auth-error" role="alert">{error}</p>}<p><Link href="/connect">See MCP connection instructions ↗</Link></p></section><section className="auth-settings-card"><h2>Agent credentials</h2>{loading ? <p role="status">Loading credentials…</p> : keys.length === 0 ? <p>No credentials yet. Create one to connect an agent.</p> : <ul className="auth-key-list">{keys.map(key => <li key={key.id}><div><strong>{key.name}</strong><small>{key.campaign_title || "My workspace"} · Created {new Date(key.created_at).toLocaleDateString()}{key.revoked_at && " · Revoked"}</small></div>{!key.revoked_at && <button type="button" disabled={busy} onClick={() => revoke(key.id)}>Revoke</button>}</li>)}</ul>}</section></div>;
}
