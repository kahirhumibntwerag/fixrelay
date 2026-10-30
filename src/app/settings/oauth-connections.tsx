"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "./oauth-connections.css";

type Connection = {
  id: string;
  client_id: string;
  name: string;
  client_uri: string | null;
  scopes: string[];
  created_at?: string;
  updated_at?: string;
};
const scopes: Record<string, string> = {
  openid: "Account identity",
  profile: "Basic profile",
  offline_access: "Refresh access",
  "research:read": "Read research",
  "research:write": "Record and publish research",
};

export function OAuthConnections() {
  const [connections, setConnections] = useState<Connection[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function load(signal?: AbortSignal) {
    const response = await fetch("/api/oauth/connections", {
        cache: "no-store",
        signal,
      }),
      data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Unable to load connected applications.");
    setConnections(data.connections || []);
  }
  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal)
      .catch((cause) => {
        if (!abort.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, []);
  async function revoke(id: string) {
    setBusy(id);
    setError("");
    try {
      const response = await fetch("/api/oauth/connections", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }),
        data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to revoke application access.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to revoke application access.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="auth-settings-card">
      <h2>Connected applications</h2>
      <p>
        Connect Codex or another OAuth-compatible agent by signing in and
        approving its requested access. No token copying is required.
      </p>
      {loading ? (
        <p role="status">Loading connected applications…</p>
      ) : connections.length ? (
        <ul className="auth-key-list">
          {connections.map((connection) => (
            <li key={connection.id}>
              <div>
                <strong>{connection.name}</strong>
                <small>
                  {connection.scopes
                    .map((scope) => scopes[scope] || scope)
                    .join(" · ")}
                </small>
                <small>
                  Connected{" "}
                  {connection.created_at
                    ? new Date(connection.created_at).toLocaleDateString()
                    : "date unavailable"}
                </small>
                <details className="oauth-connection-details">
                  <summary>Connection details</summary>
                  <small>
                    Client ID: <code>{connection.client_id}</code>
                  </small>
                </details>
              </div>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => revoke(connection.id)}
              >
                {busy === connection.id ? "Revoking…" : "Revoke access"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          No connected applications yet. Start the connection from your agent’s
          plugin settings.
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <p className="oauth-connections-note">
        OAuth applications inherit your campaign permissions. Write access lets
        owners publish selected findings; agents cannot approve researcher
        reviews.
      </p>
      <p>
        <Link href="/connect">How to connect a plugin →</Link>
      </p>
    </section>
  );
}
