-- Better Auth's built-in PostgreSQL schema. Keep all fields owned by the library.
CREATE TABLE IF NOT EXISTS "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE TABLE IF NOT EXISTS "session" (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
-- statement
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId");
-- statement
CREATE TABLE IF NOT EXISTS account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("providerId","accountId")
);
-- statement
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON account("userId");
-- statement
CREATE TABLE IF NOT EXISTS verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON verification(identifier);
-- statement
CREATE TABLE IF NOT EXISTS "rateLimit" (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  count integer NOT NULL,
  "lastRequest" bigint NOT NULL
);
-- statement
CREATE TABLE IF NOT EXISTS research_agent_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id),
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
-- statement
CREATE INDEX IF NOT EXISTS research_agent_keys_user_idx ON research_agent_keys(user_id,created_at DESC);
-- statement
CREATE TABLE IF NOT EXISTS research_auth_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id),
  event_type text NOT NULL CHECK(event_type IN ('agent_key_created','agent_key_revoked')),
  key_id uuid NOT NULL REFERENCES research_agent_keys(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
