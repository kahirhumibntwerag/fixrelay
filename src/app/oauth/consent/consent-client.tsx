"use client";
import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, ArrowUpRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const permissions: Record<string, { title: string; description: string }> = {
  openid: {
    title: "Identify your RogNet account",
    description:
      "Associate this connection with the account you are signed into.",
  },
  profile: {
    title: "Read your basic profile",
    description: "Use your display name to identify this connection.",
  },
  "research:read": {
    title: "Read your research",
    description:
      "Read private campaigns, hypotheses, experiments and evidence you can access.",
  },
  "research:write": {
    title: "Record and publish research on your behalf",
    description:
      "Create campaigns, register metrics and experiments, upload charts, record evidence and request review. Campaign owners can publish selected completed experiments and charts.",
  },
  offline_access: {
    title: "Keep the connection available",
    description:
      "Refresh access without asking you to sign in for each research session, until you revoke the connection.",
  },
};
export function OAuthConsent({
  name,
  clientName,
  clientId,
  callback,
  scopes,
  requestedClaims,
}: {
  name: string;
  clientName: string;
  clientId: string;
  callback: string;
  scopes: string[];
  requestedClaims: string[];
}) {
  const [busy, setBusy] = useState<boolean | null>(null),
    [error, setError] = useState("");
  async function decide(accept: boolean) {
    setBusy(accept);
    setError("");
    try {
      const result = await authClient.oauth2.consent({
        accept,
        scope: scopes.join(" "),
      });
      if (result.error) {
        setError(
          result.error.message ||
            "Unable to complete this connection. Start again from your agent.",
        );
        setBusy(null);
        return;
      }
      // OAuth provider client follows only the redirect returned by its verified
      // consent endpoint. Never navigate to a callback read from this page URL.
      const response = result.data as {
        redirect?: boolean;
        url?: string;
      } | null;
      if (!response?.redirect || !response.url) {
        setError(
          "No return address was provided. Start the connection again from your agent.",
        );
        setBusy(null);
      }
    } catch {
      setError("Unable to reach the connection service. Please retry.");
      setBusy(null);
    }
  }
  return (
    <section className="auth-pane oauth-consent">
      <div className="oauth-symbol">
        <ShieldCheck size={24} />
      </div>
      <span className="auth-eyebrow">AUTHORIZE AN APPLICATION</span>
      <h1>Connect {clientName}?</h1>
      <p>
        Signed in as <strong>{name}</strong>. Review the access this application
        is requesting.
      </p>
      <div className="oauth-app-identity">
        <span>Application return destination</span>
        <strong>{callback}</strong>
      </div>
      <ul className="oauth-permissions">
        {scopes.map((scope) => (
          <li key={scope}>
            <ShieldCheck size={17} aria-hidden="true" />
            <div>
              <strong>{permissions[scope]?.title || scope}</strong>
              <p>{permissions[scope]?.description}</p>
              <code>{scope}</code>
            </div>
          </li>
        ))}
      </ul>
      {requestedClaims.length > 0 && (
        <p className="oauth-claims">
          Requested profile fields: {requestedClaims.join(", ")}.
        </p>
      )}
      <div className="oauth-boundary">
        The application cannot approve researcher reviews. Write access allows
        owner-authorized publication of selected findings; unselected records
        stay private. You can revoke access in Settings.
      </div>
      <details className="oauth-client-details">
        <summary>Application connection details</summary>
        <dl>
          <dt>Client ID</dt>
          <dd>
            <code>{clientId}</code>
          </dd>
          <dt>Return destination</dt>
          <dd>
            <code>{callback}</code>
          </dd>
        </dl>
      </details>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="oauth-actions">
        <button
          type="button"
          className="oauth-cancel"
          disabled={busy !== null}
          onClick={() => decide(false)}
        >
          {busy === false ? "Returning…" : "Cancel"}
        </button>
        <button
          type="button"
          className="button"
          disabled={busy !== null}
          onClick={() => decide(true)}
        >
          {busy === true ? "Connecting…" : "Allow access"}
          <ArrowUpRight size={16} />
        </button>
      </div>
      <p className="auth-note">
        You can revoke this application’s access in{" "}
        <Link href="/settings">account settings</Link>.
      </p>
    </section>
  );
}
