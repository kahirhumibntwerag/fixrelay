import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { getAuth } from "@/lib/auth";
import { currentHuman } from "@/lib/auth-access";
import { OAuthConsent } from "./consent-client";
import "@/components/auth.css";
import "./oauth.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect an application · RogNet" };
const allowedScopes = new Set([
  "openid",
  "profile",
  "offline_access",
  "research:read",
  "research:write",
]);

function InvalidRequest() {
  return (
    <div className="content">
      <section className="auth-pane">
        <span className="auth-eyebrow">APPLICATION CONNECTION</span>
        <h1>This connection request is unavailable.</h1>
        <p>
          The request may have expired or been changed. Return to your agent and
          start the connection again.
        </p>
        <Link className="text-link" href="/settings">
          Back to account settings →
        </Link>
      </section>
    </div>
  );
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = await searchParams,
    query = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(name, item));
    else if (value !== undefined) query.append(name, value);
  }
  if (query.toString().length > 16000) return <InvalidRequest />;
  const auth = getAuth(),
    { secret } = await auth.$context;
  if (!(await verifyOAuthQueryParams(query.toString(), secret)))
    return <InvalidRequest />;
  const human = await currentHuman();
  if (!human) redirect("/sign-in?" + query.toString());
  const clientId = query.get("client_id"),
    scopes = [
      ...new Set((query.get("scope") || "").split(" ").filter(Boolean)),
    ];
  if (
    !clientId ||
    !scopes.length ||
    scopes.some((scope) => !allowedScopes.has(scope))
  )
    return <InvalidRequest />;
  try {
    const client = await auth.api.getOAuthClientPublic({
      query: { client_id: clientId },
      headers: await headers(),
    });
    if (!client) return <InvalidRequest />;
    let claims: Record<string, unknown> | undefined;
    if (query.has("claims")) {
      const parsed = JSON.parse(query.get("claims")!);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return <InvalidRequest />;
      claims = parsed;
    }
    const publicClient = client as {
      client_name?: string;
      client_uri?: string;
    };
    const requestedRedirect = query.get("redirect_uri");
    // The provider validates the registered redirect before signing this
    // authorization query. Its public-client response intentionally omits URIs.
    if (!requestedRedirect) return <InvalidRequest />;
    const callback = new URL(requestedRedirect);
    const requestedClaims =
      claims?.userinfo &&
      typeof claims.userinfo === "object" &&
      !Array.isArray(claims.userinfo)
        ? Object.keys(claims.userinfo)
        : [];
    return (
      <div className="content">
        <OAuthConsent
          name={human.name}
          clientName={publicClient.client_name || "Application"}
          clientId={clientId}
          callback={
            callback.origin === "null" ? callback.protocol : callback.origin
          }
          scopes={scopes}
          requestedClaims={requestedClaims}
        />
      </div>
    );
  } catch {
    return <InvalidRequest />;
  }
}
