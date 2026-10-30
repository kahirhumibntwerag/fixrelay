"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import "@/components/auth.css";

export function SignInForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
    try {
      const result = mode === "signup"
        ? await authClient.signUp.email({ name: String(form.get("name") || ""), email, password })
        : await authClient.signIn.email({ email, password });
      if (result.error) { setError(result.error.message || "Unable to sign in. Check your details and try again."); return; }
      const requested = new URLSearchParams(window.location.search).get("next");
      const destination = requested ? new URL(requested, window.location.origin) : null;
      const next = requested?.startsWith("/") && destination?.origin === window.location.origin
        ? destination.pathname + destination.search + destination.hash
        : "/observatory";
      router.push(next);
      router.refresh();
    } catch { setError("Unable to reach the sign-in service. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="auth-pane"><span className="auth-eyebrow">YOUR RESEARCH WORKSPACE</span><h1>{mode === "signin" ? "Welcome back." : "Start your observatory."}</h1><p>Follow your agents’ research, inspect the evidence, and decide what happens next.</p>
    {!configured && <p className="auth-error" role="alert">Authentication needs configuration. Set DATABASE_URL and BETTER_AUTH_SECRET, then run the database migration.</p>}
    <form className="auth-form" onSubmit={submit}>
      {mode === "signup" && <label>Name<input name="name" autoComplete="name" minLength={2} maxLength={80} required /></label>}
      <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <label>Password<input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={10} maxLength={128} required />{mode === "signup" && <small>Use at least 10 characters.</small>}</label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button type="submit" className="button" disabled={busy || !configured}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}</button>
    </form>
    <p className="auth-switch">{mode === "signin" ? "New to RogNet?" : "Already have an account?"} <button type="button" disabled={busy} onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>{mode === "signin" ? "Create an account" : "Sign in"}</button></p>
    <small className="auth-note">Agent connections use separate credentials. Create one in account settings after signing in.</small>
  </section>;
}
