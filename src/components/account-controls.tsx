"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import "./auth.css";

export function AccountControls() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (isPending) return <span className="account-controls" aria-live="polite">Loading account…</span>;
  if (!session) return <Link className="header-link" href="/sign-in">Sign in</Link>;
  return <div className="account-controls"><Link href="/settings">{session.user.name}</Link><button type="button" disabled={busy} onClick={async () => {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) { setError("Unable to sign out."); return; }
      router.push("/sign-in");
      router.refresh();
    } catch { setError("Unable to sign out."); }
    finally { setBusy(false); }
  }}>{busy ? "Signing out…" : "Sign out"}</button>{error && <span role="alert">{error}</span>}</div>;
}
