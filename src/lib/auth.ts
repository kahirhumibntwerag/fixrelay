import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { APIError } from "better-auth/api";
import { databaseUrl } from "./database-config";
import {
  canonicalOrigin,
  canonicalMcpResource,
  oauthIssuer,
  oauthScopes,
} from "./oauth-config";

let pool: Pool | undefined;
let instance: ReturnType<typeof createAuth> | undefined;

export function authConfigured() {
  return Boolean(
    databaseUrl() &&
      process.env.BETTER_AUTH_SECRET &&
      process.env.BETTER_AUTH_SECRET.length >= 32,
  );
}

export function getAuthPool() {
  const connectionString = databaseUrl();
  if (!connectionString)
    throw Object.assign(new Error("Database is not configured."), {
      status: 503,
    });
  const schema = process.env.DATABASE_SCHEMA;
  if (schema && !/^[a-z_][a-z0-9_]{0,62}$/.test(schema))
    throw new Error("DATABASE_SCHEMA must be a lowercase PostgreSQL identifier.");
  const address = new URL(connectionString);
  if (schema && address.hostname.endsWith(".pooler.supabase.com") && address.port === "6543")
    throw new Error("A private schema requires Supabase's session pooler, not transaction mode.");
  const ca = process.env.DATABASE_CA_CERT;
  if (ca) {
    // pg's URL sslmode overrides the explicit SSL object, so remove it when
    // providing a trusted CA. Verification remains enabled.
    address.searchParams.delete("sslmode");
    address.searchParams.delete("sslrootcert");
  }
  pool ??= new Pool({
    connectionString: address.toString(),
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
    max: 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
  });
  return pool;
}

function createAuth() {
  return betterAuth({
    appName: "RogNet",
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: canonicalOrigin(),
    disabledPaths: ["/token"],
    database: getAuthPool(),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
    plugins: [
      jwt({ jwt: { issuer: oauthIssuer() } }),
      mcp({
        loginPage: "/sign-in",
        consentPage: "/oauth/consent",
        resource: canonicalMcpResource(),
        resourceSeedMode: "merge",
        scopes: oauthScopes,
        resources: [
          {
            identifier: canonicalMcpResource(),
            name: "RogNet research workspace",
            // Keep offline_access in the resource-bound refresh grant. The
            // provider persists these effective scopes for token rotation.
            allowedScopes: oauthScopes,
            accessTokenTtl: 600,
          },
        ],
        grantTypes: ["authorization_code", "refresh_token"],
        clientRegistrationDefaultScopes: oauthScopes,
        clientRegistrationAllowedScopes: oauthScopes,
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
        clientRegistrationRequirePKCE: true,
        // Public clients register through the constrained DCR/CIMD paths.
        // User accounts must not administer the shared authorization server,
        // alter global resource policies, or mint trusted first-party clients.
        clientPrivileges: async () => false,
        resourcePrivileges: async () => false,
        accessTokenExpiresIn: 600,
        refreshTokenExpiresIn: 60 * 60 * 24 * 30,
        refreshTokenReuseInterval: 0,
        codeExpiresIn: 300,
        extensions: [
          {
            claims: {
              accessToken: async ({ user, client }) => {
                if (!user)
                  throw new APIError("UNAUTHORIZED", {
                    message: "User-delegated authorization is required",
                  });
                const { rows } = await getAuthPool().query(
                  'SELECT id FROM "oauthConsent" WHERE "userId"=$1 AND "clientId"=$2 AND "referenceId" IS NULL ORDER BY "createdAt" DESC LIMIT 1',
                  [user.id, client.clientId],
                );
                if (!rows[0])
                  throw new APIError("UNAUTHORIZED", {
                    message: "OAuth consent is no longer active",
                  });
                // Bind each signed token to the particular consent record. Deleting
                // consent and reconnecting must never revive a previously issued JWT.
                return { rognet_grant_id: rows[0].id };
              },
            },
          },
        ],
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
      nextCookies(),
    ],
  });
}

export function getAuth() {
  if (!authConfigured())
    throw Object.assign(
      new Error(
        "Authentication is not configured. Set DATABASE_URL and a BETTER_AUTH_SECRET of at least 32 characters.",
      ),
      { status: 503 },
    );
  return (instance ??= createAuth());
}
