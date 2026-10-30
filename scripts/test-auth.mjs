import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.TEST_BASE_URL || "http://localhost:3001";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) {
  throw new Error("Authentication tests create synthetic users. Run against a local test database and server.");
}
const email = `auth-${randomUUID()}@example.invalid`;
const password = "Synthetic-test-password-2026!";
let cookie = "";
async function request(path, { body, origin = new URL(base).origin, authenticated = true } = {}) {
  const response = await fetch(new URL(path, base), {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(authenticated && cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return response;
}
function sessionCookie(response) {
  return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
}
async function status(response, expected) {
  assert.equal(response.status, expected, await response.clone().text());
}

await status(await request("/api/agent-keys", { authenticated: false }), 401);
const signup = await request("/api/auth/sign-up/email", { body: { name: "Synthetic authentication test", email, password } });
await status(signup, 200);
cookie = sessionCookie(signup);
assert.ok(cookie.includes("better-auth.session_token="));
await status(await request("/api/agent-keys"), 200);
const session = await request("/api/auth/get-session");
await status(session, 200);
assert.equal((await session.json()).user.email, email);

await status(await request("/api/agent-keys", { body: { name: "Rejected origin", campaign_id: null }, origin: "https://evil.invalid" }), 403);
await status(await request("/api/agent-keys", { body: { name: "Missing origin", campaign_id: null }, origin: "" }), 403);
await status(await request("/api/auth/sign-out", { body: {}, origin: "https://evil.invalid" }), 403);
await status(await request("/api/agent-keys"), 200);

await status(await request("/api/auth/sign-out", { body: {} }), 200);
await status(await request("/api/agent-keys"), 401);
await status(await request("/api/auth/sign-in/email", { body: { email, password: "incorrect-password" }, authenticated: false }), 401);
const signin = await request("/api/auth/sign-in/email", { body: { email, password }, authenticated: false });
await status(signin, 200);
cookie = sessionCookie(signin);
await status(await request("/api/agent-keys"), 200);
await status(await request("/api/auth/sign-out", { body: {} }), 200);
await status(await request("/api/agent-keys"), 401);
console.log("Authentication passed: signup, sessions, anonymous rejection, wrong password, sign-in, same-origin protection, sign-out, revoked sessions.");
