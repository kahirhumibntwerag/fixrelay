export const researchScopes = ["research:read", "research:write"] as const;
export const oauthScopes = [
  "openid",
  "profile",
  "offline_access",
  ...researchScopes,
];

export function canonicalOrigin() {
  const configured =
    process.env.BETTER_AUTH_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://fixrelay.vercel.app"
      : "http://localhost:3000");
  const url = new URL(configured);
  if (url.username || url.password || url.search || url.hash)
    throw new Error("BETTER_AUTH_URL must be a canonical origin");
  return url.origin;
}
export const canonicalMcpResource = () => canonicalOrigin() + "/mcp";
export const oauthIssuer = () => canonicalOrigin() + "/api/auth";
export const oauthMetadataURL = () =>
  canonicalOrigin() + "/.well-known/oauth-protected-resource/mcp";
