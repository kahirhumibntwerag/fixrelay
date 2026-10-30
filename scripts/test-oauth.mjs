import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { auth as mcpAuth } from "@modelcontextprotocol/client";
import { connectResearch, toolData } from "./demo-research.mjs";

const base = new URL(process.argv[2] || "http://localhost:3001").origin;
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname) && process.env.ALLOW_REMOTE_OAUTH_TEST !== "1") {
  throw new Error("Run this write-based OAuth suite against a disposable local database. Remote tests require ALLOW_REMOTE_OAUTH_TEST=1 and a dedicated test deployment.");
}
const resource = `${base}/mcp`;
const issuer = `${base}/api/auth`;
const callback = "http://127.0.0.1:38761/oauth/callback";
const fullScope = "openid profile offline_access research:read research:write";
const marker = randomUUID();
// Keep repeated local verification runs independent of each other's per-IP
// throttles. Remote tests retain their real network identity.
const localTestHeaders = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)
  ? { "x-forwarded-for": `127.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${Math.max(1, randomBytes(1)[0])}` } : {};
const password = randomBytes(24).toString("base64url");
const clients = [];

class BrowserSession {
  cookies = new Map();
  acceptCookies(response) {
    for (const entry of response.headers.getSetCookie()) {
      const pair = entry.split(";", 1)[0];
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator), value = pair.slice(separator + 1);
      if (value) this.cookies.set(name, value); else this.cookies.delete(name);
    }
  }
  header() { return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "); }
}
async function request(path, { method = "GET", session, body, form, bearer, origin, headers = {} } = {}) {
  const url = new URL(path, base);
  assert.equal(url.origin, base, "The integration client must never follow an external callback URL");
  const response = await fetch(url, {
    method, redirect: "manual", signal: AbortSignal.timeout(30000),
    headers: {
      ...(session ? { Cookie: session.header() } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(form !== undefined ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(origin ? { Origin: origin } : {}), ...localTestHeaders, ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : form !== undefined ? new URLSearchParams(form).toString() : undefined,
  });
  session?.acceptCookies(response);
  const contentType = response.headers.get("content-type") || "";
  const jsonBody = contentType.includes("json") ? await response.text() : "";
  const data = jsonBody ? JSON.parse(jsonBody) : null;
  return { response, data, location: response.headers.get("location") };
}
function expectStatus(result, status, operation) {
  assert.equal(result.response.status, status, `${operation} returned HTTP ${result.response.status}; expected ${status}`);
  return result.data;
}
function expectOAuthFailure(result, operation, expectedError) {
  const destination = result.location || result.data?.url;
  const location = destination ? new URL(destination, base) : null;
  const error = result.data?.error || location?.searchParams.get("error");
  assert(result.response.status >= 400 || error, `${operation} must fail instead of issuing access`);
  if (expectedError) assert.equal(error, expectedError, `${operation} should report ${expectedError}`);
}
function redirectURL(result, operation) {
  const value = result.location || result.data?.url;
  assert.equal(typeof value, "string", `${operation} must return a redirect URL`);
  return new URL(value, base);
}
const oauthFetch = (url, init = {}) => {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(localTestHeaders)) headers.set(name, value);
  return fetch(url, { ...init, headers });
};
const pkce = () => {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
function authURL(clientId, scope = fullScope, extra = {}) {
  const challenge = pkce(), state = randomUUID();
  const url = new URL(`${issuer}/oauth2/authorize`);
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: "code", scope, state, resource, code_challenge: challenge.challenge, code_challenge_method: "S256", prompt: "consent", ...extra }).toString();
  return { url, state, verifier: challenge.verifier };
}
async function consentFromAuthorization(url, session, { accept = true, scope, checkPage = false } = {}) {
  const authorization = await request(url, { session });
  const redirect = redirectURL(authorization, "Authorization");
  assert.equal(redirect.origin, base, "Authorization must reach our consent page before the client callback");
  assert.equal(redirect.pathname, "/oauth/consent");
  if (checkPage) {
    const page = await request(redirect, { session });
    assert.equal(page.response.status, 200, "The server-rendered consent page must accept the authentic signed request");
  }
  const oauthQuery = redirect.search.slice(1);
  const result = await request(`${issuer}/oauth2/consent`, { method: "POST", session, origin: base, body: { accept, ...(scope ? { scope } : {}), oauth_query: oauthQuery } });
  expectStatus(result, 200, "Consent");
  const destination = redirectURL(result, "Consent");
  assert.equal(destination.origin + destination.pathname, new URL(callback).origin + new URL(callback).pathname, "Only the registered client callback may receive the authorization result");
  return { destination, oauthQuery, consentURL: redirect };
}
async function authorizationCode(clientId, session, scope = fullScope, extra = {}) {
  const attempt = authURL(clientId, scope, extra);
  const result = await consentFromAuthorization(attempt.url, session, { scope });
  assert.equal(result.destination.searchParams.get("state"), attempt.state, "OAuth state must survive the complete redirect flow");
  assert.equal(result.destination.searchParams.get("iss"), issuer, "RFC 9207 issuer must identify the authorization response");
  const code = result.destination.searchParams.get("code");
  assert(code, "Consent must issue an authorization code");
  return { ...attempt, ...result, code };
}
async function tokenExchange(clientId, attempt, changes = {}) {
  return request(`${issuer}/oauth2/token`, { method: "POST", form: { grant_type: "authorization_code", client_id: clientId, redirect_uri: callback, code: attempt.code, code_verifier: attempt.verifier, resource, ...changes } });
}
async function rpcError(client, name, args, expectedStatus) {
  let result;
  try { result = await client.callTool({ name, arguments: args }); }
  catch (error) {
    const status = error.data?.status || error.status || error.statusCode || (error.name === "UnauthorizedError" ? 401 : error.name === "InsufficientScopeError" ? 403 : undefined);
    if (!status) throw error;
    if (expectedStatus) assert.equal(status, expectedStatus, `${name} must reject the transport request with the authorization status`);
    return { httpStatus: status };
  }
  assert.equal(result.isError, true, `${name} must be rejected`);
  const value = result.structuredContent || JSON.parse(result.content.find(c => c.type === "text").text);
  if (expectedStatus) assert.equal(value.status, expectedStatus, `${name} must report the authorization status`);
  return result;
}
async function signedTokenFixtures(claims) {
  const databaseURL = process.env.DATABASE_URL;
  if (!databaseURL || !process.env.BETTER_AUTH_SECRET || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseURL).hostname)) {
    console.log("SKIP: signed expiry/issuer/audience fixtures require the disposable local database environment");
    return;
  }
  const [{ betterAuth }, { jwt }, { Pool }] = await Promise.all([import("better-auth"), import("better-auth/plugins"), import("pg")]);
  const pool = new Pool({ connectionString: databaseURL, max: 1 });
  try {
    // Use Better Auth's server-only signing API and the disposable database's
    // existing test key. A valid control proves the negative fixtures are
    // rejected for their claims rather than an invalid signature or format.
    const signer = betterAuth({ baseURL: base, secret: process.env.BETTER_AUTH_SECRET, database: pool, plugins: [jwt({ jwt: { issuer } })] });
    const sign = async changes => (await signer.api.signJWT({ body: { payload: { ...claims, jti: randomUUID(), ...changes } } })).token;
    const now = Math.floor(Date.now() / 1000);
    const control = await sign({ iat: now, exp: now + 120 });
    expectStatus(await request("/api/research", { bearer: control }), 200, "Valid signed fixture control");
    const expired = await sign({ iat: now - 180, exp: now - 60 });
    expectStatus(await request("/api/research", { bearer: expired }), 401, "Expired but correctly signed token");
    const wrongIssuer = await sign({ iss: "https://wrong-issuer.invalid", iat: now, exp: now + 120 });
    expectStatus(await request("/api/research", { bearer: wrongIssuer }), 401, "Correctly signed token with wrong issuer");
    const wrongAudience = await sign({ aud: "https://wrong-audience.invalid/mcp", iat: now, exp: now + 120 });
    expectStatus(await request("/api/research", { bearer: wrongAudience }), 401, "Correctly signed token with wrong audience");
    console.log("PASS: valid-signature control and independently signed expired, wrong-issuer and wrong-audience token rejection");
  } finally { await pool.end(); }
}

try {
  const metadata = expectStatus(await request("/.well-known/oauth-protected-resource"), 200, "Protected resource discovery");
  assert.equal(metadata.resource, resource);
  assert(metadata.authorization_servers.includes(issuer));
  assert(metadata.scopes_supported.includes("research:read"));
  assert.equal((await request("/.well-known/oauth-protected-resource/mcp")).response.status, 200);
  const asMetadata = expectStatus(await request("/.well-known/oauth-authorization-server/api/auth"), 200, "RFC 8414 issuer-path discovery");
  assert.equal(asMetadata.issuer, issuer);
  assert(asMetadata.code_challenge_methods_supported.includes("S256"));
  assert.equal(asMetadata.client_id_metadata_document_supported, true);
  assert.equal(asMetadata.authorization_response_iss_parameter_supported, true);
  assert.equal(asMetadata.authorization_endpoint, `${issuer}/oauth2/authorize`);
  assert.equal(asMetadata.token_endpoint, `${issuer}/oauth2/token`);
  assert.equal(asMetadata.registration_endpoint, `${issuer}/oauth2/register`);
  const rootAlias = await request("/.well-known/oauth-authorization-server");
  assert([200, 404].includes(rootAlias.response.status), "An optional root metadata alias must be valid or absent; the issuer-path endpoint is authoritative");
  if (rootAlias.response.status === 200) assert.equal(rootAlias.data.issuer, issuer);
  console.log("PASS: OAuth and resource discovery, S256 PKCE, CIMD, DCR fallback and issuer identification");

  const anonymous = await connectResearch(base, null, "rognet-oauth-anonymous-test"); clients.push(anonymous);
  const listed = await anonymous.listTools();
  const privateTool = listed.tools.find(tool => tool.name === "list_campaigns");
  const schemes = privateTool?.securitySchemes || privateTool?._meta?.securitySchemes;
  assert(Array.isArray(schemes) && schemes.some(scheme => scheme.type === "oauth2"), "Private tool discovery must declare OAuth security schemes");
  const missingCredential = await request(resource, { method: "POST", headers: { Accept: "application/json, text/event-stream" }, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_campaigns", arguments: {} } } });
  expectStatus(missingCredential, 401, "Missing OAuth credential challenge");
  assert(missingCredential.response.headers.get("www-authenticate")?.includes("resource_metadata="), "HTTP challenges must identify the protected-resource metadata");
  assert(Array.isArray(missingCredential.data?._meta?.["mcp/www_authenticate"]), "A missing token must also provide the plugin's tool-level OAuth challenge metadata");
  assert(Array.isArray(toolData(await anonymous.callTool({ name: "search_public_campaigns", arguments: {} })).items));
  console.log("PASS: anonymous public search and plugin-compatible private-tool OAuth challenge");

  const account = new BrowserSession();
  const email = `oauth-${marker}@example.test`;
  const signup = await request("/api/auth/sign-up/email", { method: "POST", session: account, origin: base, body: { name: "SYNTHETIC OAuth integration researcher", email, password } });
  const user = expectStatus(signup, 200, "Test researcher signup").user;
  assert(account.header(), "Signup must establish a human session");
  for (const path of ["/api/auth/admin/oauth2/resources", "/api/auth/oauth2/create-client"]) {
    const attempt = await request(path, { method: "POST", session: account, origin: base, body: path.includes("resources")
      ? { identifier: "https://synthetic-forbidden.invalid/mcp", name: "SYNTHETIC unauthorized resource", allowedScopes: ["research:read"] }
      : { client_name: "SYNTHETIC unauthorized privileged client", redirect_uris: [callback], token_endpoint_auth_method: "none", application_type: "native" } });
    assert([401, 403, 404].includes(attempt.response.status), "Ordinary signed-in users must not administer OAuth clients or resource policies");
  }

  // Let the official MCP client perform discovery, DCR and PKCE rather than
  // imitating a plugin by manually attaching a static service credential.
  const provider = {
    redirectUrl: callback,
    clientMetadata: { client_name: "SYNTHETIC MCP OAuth integration", redirect_uris: [callback], application_type: "native", token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: fullScope },
    clientInformation() { return this.client; },
    saveClientInformation(value) { this.client = value; },
    tokens() { return this.savedTokens; },
    saveTokens(value) { this.savedTokens = value; },
    redirectToAuthorization(url) { this.authorizationURL = url; },
    saveCodeVerifier(value) { this.verifier = value; },
    codeVerifier() { return this.verifier; },
    state() { return marker; },
    saveDiscoveryState(value) { this.discovery = value; },
    discoveryState() { return this.discovery; },
  };
  assert.equal(await mcpAuth(provider, { serverUrl: resource, scope: fullScope, fetchFn: oauthFetch }), "REDIRECT");
  assert(provider.client?.client_id && provider.authorizationURL && provider.verifier, "The official SDK must discover, register and prepare PKCE authorization");
  const clientId = provider.client.client_id;
  const completed = await consentFromAuthorization(provider.authorizationURL, account, { scope: fullScope, checkPage: true });
  assert.equal(completed.destination.searchParams.get("state"), marker);
  assert.equal(await mcpAuth(provider, { serverUrl: resource, authorizationCode: completed.destination.searchParams.get("code"), iss: completed.destination.searchParams.get("iss"), fetchFn: oauthFetch }), "AUTHORIZED");
  const tokens = provider.savedTokens;
  assert(tokens.access_token && tokens.refresh_token, "Offline consent must issue access and refresh tokens");
  assert(tokens.expires_in > 0 && tokens.expires_in <= 3600, "Access tokens must have a bounded lifetime");
  const claims = JSON.parse(Buffer.from(tokens.access_token.split(".")[1], "base64url").toString());
  assert.equal(claims.iss, issuer); assert.equal(claims.sub, user.id);
  assert([claims.aud].flat().includes(resource)); assert(claims.exp > Math.floor(Date.now() / 1000));
  console.log("PASS: official MCP SDK OAuth discovery, dynamic registration, signed consent, PKCE code exchange and resource-bound expiring token");
  const defaultScopeAttempt = authURL(clientId); defaultScopeAttempt.url.searchParams.delete("scope");
  const defaultScopeConsent = await consentFromAuthorization(defaultScopeAttempt.url, account);
  const defaultScopeTokens = expectStatus(await tokenExchange(clientId, { ...defaultScopeAttempt, code: defaultScopeConsent.destination.searchParams.get("code") }), 200, "Omitted-scope plugin authorization");
  assert(defaultScopeTokens.scope.split(" ").includes("research:read") && defaultScopeTokens.scope.split(" ").includes("research:write"), "Clients that omit scope must receive the configured research permissions after explicit consent");

  // A separate browser session must preserve the signed authorization request
  // through login rather than dropping the user into the normal dashboard.
  const fresh = new BrowserSession(), loginAttempt = authURL(clientId, "openid research:read");
  const loginRedirect = redirectURL(await request(loginAttempt.url), "Anonymous authorization");
  assert.equal(loginRedirect.origin, base); assert.equal(loginRedirect.pathname, "/sign-in");
  assert.equal(loginRedirect.searchParams.get("client_id"), clientId);
  const login = await request("/api/auth/sign-in/email", { method: "POST", session: fresh, origin: base, body: { email, password, oauth_query: loginRedirect.search.slice(1) } });
  expectStatus(login, 200, "OAuth login continuation");
  const loginContinuation = redirectURL(login, "OAuth login continuation");
  assert.equal(loginContinuation.origin, base); assert.equal(loginContinuation.pathname, "/oauth/consent");
  const malformedConsent = new URL(completed.consentURL); malformedConsent.searchParams.set("scope", "research:write admin");
  const unavailableConsent = await request(malformedConsent, { session: account });
  assert(unavailableConsent.response.status >= 400 || (await unavailableConsent.response.text()).includes("This connection request is unavailable."), "Tampered consent parameters must not render an approval form");
  const tamperedPost = await request(`${issuer}/oauth2/consent`, { method: "POST", session: account, origin: base, body: { accept: true, oauth_query: malformedConsent.search.slice(1) } });
  expectOAuthFailure(tamperedPost, "Tampered signed consent");
  console.log("PASS: signed authorization survives login, and modified consent requests are rejected");

  const agent = await connectResearch(base, tokens.access_token, "rognet-oauth-authorized-agent"); clients.push(agent);
  const campaignInput = { title: "SYNTHETIC OAuth private research", question: "Does delegated OAuth preserve campaign permissions and human oversight?", summary: "Synthetic OAuth integration fixture only; no scientific findings.", objective: "Verify delegated agent access", metric: { name: "Checks", direction: "maximize", baseline: 0, target: 1, evaluation_protocol: "SYNTHETIC OAuth fixture v1" } };
  const campaign = toolData(await agent.callTool({ name: "create_campaign", arguments: { ...campaignInput, idempotency_key: randomUUID() } }));
  const scope = { campaign_id: campaign.id };
  assert.equal(toolData(await agent.callTool({ name: "get_campaign", arguments: scope })).campaign.id, campaign.id);
  const hypothesis = toolData(await agent.callTool({ name: "create_hypothesis", arguments: { ...scope, title: "SYNTHETIC OAuth run ownership", statement: "Refreshing credentials preserves the running agent's identity.", rationale: "Token rotation must not break ongoing research ownership.", prediction: "A refreshed token from the same client updates its original run.", idempotency_key: randomUUID() } }));
  const experiment = toolData(await agent.callTool({ name: "propose_experiment", arguments: { ...scope, hypothesis_id: hypothesis.id, title: "SYNTHETIC OAuth credential rotation", method: "Exercise scoped agent identity across token refresh.", inputs: "Synthetic API fixture only", conditions: "SYNTHETIC OAuth fixture v1", success_criteria: "The same OAuth client retains run ownership after refreshing its token.", idempotency_key: randomUUID() } }));
  const run = toolData(await agent.callTool({ name: "start_experiment_run", arguments: { ...scope, experiment_id: experiment.id, task: "SYNTHETIC run awaiting refreshed credentials", idempotency_key: randomUUID() } }));
  const review = toolData(await agent.callTool({ name: "request_human_review", arguments: { ...scope, proposed_action: "SYNTHETIC review approval boundary", rationale: "OAuth delegates research access but never human review authority.", idempotency_key: randomUUID() } }));
  const approval = await request("/api/research", { method: "POST", bearer: tokens.access_token, body: { action: "review_request", input: { ...scope, review_id: review.id, decision: "approved" }, idempotency_key: randomUUID() } });
  expectStatus(approval, 403, "OAuth agent human-review denial");
  await rpcError(agent, "get_campaign", { campaign_id: randomUUID() }, 403);
  await signedTokenFixtures(claims);
  const readonlyAttempt = await authorizationCode(clientId, account, "openid research:read");
  const readonlyTokens = expectStatus(await tokenExchange(clientId, readonlyAttempt), 200, "Read-only token exchange");
  const readonly = await connectResearch(base, readonlyTokens.access_token, "rognet-oauth-readonly-test"); clients.push(readonly);
  assert.equal(toolData(await readonly.callTool({ name: "get_campaign", arguments: scope })).campaign.id, campaign.id);
  await rpcError(readonly, "create_hypothesis", { ...scope, title: "Forbidden OAuth write", statement: "Read scope cannot write.", rationale: "Permission boundary fixture", prediction: "This request is rejected.", idempotency_key: randomUUID() }, 403);
  await rpcError(readonly, "create_campaign", { ...campaignInput, idempotency_key: randomUUID() }, 403);
  const legacyWrite = await request("/mcp/registry", { method: "POST", bearer: readonlyTokens.access_token, headers: { Accept: "application/json, text/event-stream" }, body: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_campaign", arguments: { title: "SYNTHETIC forbidden legacy OAuth write", question: "Can a read-only OAuth token bypass its permissions through the legacy registry?", summary: "This request must be rejected by the shared legacy authorization guard." } } } });
  assert.equal(legacyWrite.data?.result?.isError, true, "Read-only OAuth must not bypass write scopes through legacy tools");
  console.log("PASS: OAuth agent reads/writes, scope enforcement, campaign membership and human-only review enforcement");

  const wrongVerifier = await authorizationCode(clientId, account);
  expectOAuthFailure(await tokenExchange(clientId, wrongVerifier, { code_verifier: randomBytes(48).toString("base64url") }), "Wrong PKCE verifier", "invalid_grant");
  const usedCode = await authorizationCode(clientId, account);
  expectStatus(await tokenExchange(clientId, usedCode), 200, "First code exchange");
  expectOAuthFailure(await tokenExchange(clientId, usedCode), "Authorization code replay", "invalid_grant");
  const wrongAudience = await authorizationCode(clientId, account);
  expectOAuthFailure(await tokenExchange(clientId, wrongAudience, { resource: "https://another-resource.invalid/mcp" }), "Wrong token resource");
  const wrongRedirect = authURL(clientId, fullScope, { redirect_uri: "https://unregistered.invalid/callback" });
  const rejectedRedirect = await request(wrongRedirect.url, { session: account });
  expectOAuthFailure(rejectedRedirect, "Unregistered redirect");
  assert(!rejectedRedirect.location?.startsWith("https://unregistered.invalid"), "An invalid redirect URI must never receive authorization data");
  const noPKCE = authURL(clientId); noPKCE.url.searchParams.delete("code_challenge"); noPKCE.url.searchParams.delete("code_challenge_method");
  expectOAuthFailure(await request(noPKCE.url, { session: account }), "Missing public-client PKCE");
  const unknownScope = authURL(clientId, "openid admin:all");
  expectOAuthFailure(await request(unknownScope.url, { session: account }), "Unknown OAuth scope");
  const privateCIMD = authURL("https://127.0.0.1/metadata.json", "openid research:read");
  expectOAuthFailure(await request(privateCIMD.url, { session: account }), "Private-address CIMD rejection");
  const invalidToken = await connectResearch(base, "not-a-valid-oauth-token", "rognet-oauth-invalid-token"); clients.push(invalidToken);
  await rpcError(invalidToken, "list_campaigns", {}, 401);
  console.log("PASS: wrong verifier, code replay, resource substitution, unregistered redirect, missing PKCE, unknown scope, private CIMD and invalid-token rejection");

  const deniedAttempt = authURL(clientId, "openid research:read");
  const denied = await consentFromAuthorization(deniedAttempt.url, account, { accept: false });
  assert.equal(denied.destination.searchParams.get("error"), "access_denied");
  assert(!denied.destination.searchParams.has("code"));
  assert.equal(denied.destination.searchParams.get("state"), deniedAttempt.state);
  const refreshed = expectStatus(await request(`${issuer}/oauth2/token`, { method: "POST", form: { grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token, resource } }), 200, "Refresh token exchange");
  assert(refreshed.access_token && refreshed.refresh_token && refreshed.refresh_token !== tokens.refresh_token, `Refresh tokens must rotate (response fields: ${Object.keys(refreshed).join(",")}; granted scope: ${refreshed.scope || "omitted"})`);
  const refreshedAgent = await connectResearch(base, refreshed.access_token, "rognet-oauth-refreshed-agent"); clients.push(refreshedAgent);
  assert.equal(toolData(await refreshedAgent.callTool({ name: "report_run_progress", arguments: { ...scope, run_id: run.id, progress: 10, task: "SYNTHETIC continuing with refreshed credentials", idempotency_key: randomUUID() } })).id, run.id, "Refreshing a token must preserve agent run ownership");
  const secondClient = expectStatus(await request(`${issuer}/oauth2/register`, { method: "POST", body: { ...provider.clientMetadata, client_name: "SYNTHETIC separate research agent" } }), 201, "Second OAuth client registration");
  const secondAttempt = await authorizationCode(secondClient.client_id, account);
  const secondTokens = expectStatus(await tokenExchange(secondClient.client_id, secondAttempt), 200, "Second OAuth client token");
  const otherAgent = await connectResearch(base, secondTokens.access_token, "rognet-oauth-other-agent"); clients.push(otherAgent);
  await rpcError(otherAgent, "report_run_progress", { ...scope, run_id: run.id, progress: 20, task: "SYNTHETIC unrelated client must not take over this run", idempotency_key: randomUUID() }, 403);
  expectOAuthFailure(await request(`${issuer}/oauth2/token`, { method: "POST", form: { grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token, resource } }), "Old refresh token replay");
  expectOAuthFailure(await request(`${issuer}/oauth2/token`, { method: "POST", form: { grant_type: "refresh_token", client_id: clientId, refresh_token: refreshed.refresh_token, resource } }), "Replayed refresh family invalidation");
  const revocationAttempt = await authorizationCode(clientId, account);
  const revocationTokens = expectStatus(await tokenExchange(clientId, revocationAttempt), 200, "Independent revocation grant");
  const revoke = await request(`${issuer}/oauth2/revoke`, { method: "POST", form: { client_id: clientId, token: revocationTokens.refresh_token, token_type_hint: "refresh_token" } });
  assert([200, 204].includes(revoke.response.status), "Refresh revocation must succeed");
  expectOAuthFailure(await request(`${issuer}/oauth2/token`, { method: "POST", form: { grant_type: "refresh_token", client_id: clientId, refresh_token: revocationTokens.refresh_token, resource } }), "Revoked refresh token");
  expectStatus(await request("/api/oauth/connections"), 401, "Anonymous connected-app settings denial");
  expectStatus(await request("/api/oauth/connections", { bearer: readonlyTokens.access_token }), 403, "Agent connected-app settings denial");
  const consents = expectStatus(await request("/api/oauth/connections", { session: account }), 200, "Connected-app consent list");
  const consentItems = consents.connections;
  assert(Array.isArray(consentItems));
  const grant = consentItems.find(item => item.clientId === clientId || item.client_id === clientId);
  assert(grant?.id, "The authorized app must be listed for its human account");
  expectStatus(await request("/api/oauth/connections", { method: "DELETE", session: account, origin: "https://foreign-origin.invalid", body: { id: grant.id } }), 403, "Cross-origin connected app revocation denial");
  expectStatus(await request("/api/oauth/connections", { method: "DELETE", session: account, origin: base, body: { id: grant.id } }), 200, "Connected app revocation");
  await rpcError(readonly, "get_campaign", scope, 401);
  const reconnectAttempt = await authorizationCode(clientId, account, "openid research:read");
  const reconnectTokens = expectStatus(await tokenExchange(clientId, reconnectAttempt), 200, "Reconnection after revoked consent");
  expectStatus(await request(`/api/research?campaign_id=${campaign.id}`, { bearer: reconnectTokens.access_token }), 200, "Newly authorized connection access");
  await rpcError(readonly, "get_campaign", scope, 401);
  expectOAuthFailure(await request(`${issuer}/oauth2/token`, { method: "POST", form: { grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token, resource } }), "Previously revoked family after reconnection");
  console.log("PASS: explicit consent denial, refresh rotation and replay defense, refresh revocation, connected-app revocation");
  console.log(`Synthetic OAuth fixture retained privately: ${base}/observatory?campaign=${campaign.id}`);
} finally {
  for (const client of clients) await client.close().catch(() => {});
}
