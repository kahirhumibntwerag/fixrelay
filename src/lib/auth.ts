import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";

let pool: Pool | undefined;
let instance: ReturnType<typeof createAuth> | undefined;

export function authConfigured() {
  return Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_SECRET.length >= 32);
}

export function getAuthPool() {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error("Database is not configured."), { status: 503 });
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 20_000, connectionTimeoutMillis: 15_000 });
  return pool;
}

function createAuth() {
  return betterAuth({
    appName: "RogNet",
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: process.env.BETTER_AUTH_URL || undefined,
    database: getAuthPool(),
    emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128, autoSignIn: true },
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
    plugins: [nextCookies()],
  });
}

export function getAuth() {
  if (!authConfigured()) throw Object.assign(new Error("Authentication is not configured. Set DATABASE_URL and a BETTER_AUTH_SECRET of at least 32 characters."), { status: 503 });
  return instance ??= createAuth();
}
