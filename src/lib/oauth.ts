import {
  createDpopReplayStore,
  requestToResourceInput,
  verifyAccessTokenRequest,
} from "better-auth/oauth2";
import { getAuth, getAuthPool } from "./auth";
import {
  canonicalMcpResource,
  oauthIssuer,
  oauthMetadataURL,
  oauthScopes,
} from "./oauth-config";
export {
  canonicalMcpResource,
  oauthIssuer,
  oauthMetadataURL,
  oauthScopes,
} from "./oauth-config";

export function oauthChallenge(
  scope = "research:read research:write",
  error: "invalid_token" | "insufficient_scope" = "invalid_token",
) {
  const scopes = scope.split(" ").filter((s) => oauthScopes.includes(s));
  return `Bearer resource_metadata="${oauthMetadataURL()}", scope="${scopes.join(" ")}", error="${error}", error_description="${error === "insufficient_scope" ? "Reconnect RogNet and approve the requested research permissions." : "Sign in to RogNet to connect this client."}"`;
}
const unauthorized = () =>
  Object.assign(
    new Error(
      "Invalid, expired, or revoked OAuth authorization. Reconnect RogNet.",
    ),
    { status: 401, oauth: true },
  );
type AccessTokenClaims = Awaited<ReturnType<typeof verifyAccessTokenRequest>>;
const verifiedRequests = new WeakMap<Request, Promise<AccessTokenClaims>>();

export async function verifyOAuthPrincipal(request: Request) {
  let claims;
  try {
    let verification = verifiedRequests.get(request);
    if (!verification) {
      verification = (async () => {
        const context = await getAuth().$context;
        return verifyAccessTokenRequest(requestToResourceInput(request), {
          verifyOptions: {
            issuer: oauthIssuer(),
            audience: canonicalMcpResource(),
          },
          jwksUrl: oauthIssuer() + "/jwks",
          dpop: { replayStore: createDpopReplayStore(context.internalAdapter) },
        });
      })();
      verifiedRequests.set(request, verification);
    }
    // Route and tool middleware may authenticate the same request. Verify a
    // DPoP proof once per request, while rechecking grant/session state below.
    claims = await verification;
  } catch {
    throw unauthorized();
  }
  if (typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000)
    throw unauthorized();
  const userId = claims.sub,
    clientId = claims.client_id,
    grantId = claims.rognet_grant_id,
    sessionId = claims.sid;
  if (
    typeof userId !== "string" ||
    typeof clientId !== "string" ||
    typeof grantId !== "string" ||
    typeof sessionId !== "string"
  )
    throw unauthorized();
  const { rows } = await getAuthPool().query(
    `SELECT u.name,c.name AS client_name,g.scopes AS consent_scopes
    FROM "user" u JOIN "session" s ON s."userId"=u.id
    JOIN "oauthConsent" g ON g."userId"=u.id
    JOIN "oauthClient" c ON c."clientId"=g."clientId"
    WHERE u.id=$1 AND s.id=$2 AND s."expiresAt">now() AND g.id=$3 AND c."clientId"=$4
      AND coalesce(c.disabled,false)=false AND g."referenceId" IS NULL`,
    [userId, sessionId, grantId, clientId],
  );
  if (!rows[0]) throw unauthorized();
  const scopes =
    typeof claims.scope === "string"
      ? claims.scope.split(" ").filter(Boolean)
      : [];
  const consentScopes = rows[0].consent_scopes as string[];
  if (scopes.some((scope) => !consentScopes.includes(scope)))
    throw unauthorized();
  return {
    kind: "agent" as const,
    userId,
    name: rows[0].client_name || "Connected research agent",
    oauthClientId: clientId,
    oauthTokenId: typeof claims.jti === "string" ? claims.jti : undefined,
    oauthGrantId: grantId,
    agentId: `oauth:${userId}:${clientId}`,
    scopes,
    campaignId: null,
  };
}
