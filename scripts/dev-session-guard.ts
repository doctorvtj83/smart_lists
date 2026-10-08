import { parse } from "dotenv";

/**
 * Safety checks for scripts/dev-session.ts, the UAT helper that writes two test users into a
 * database and mints a signed-in session cookie for the local dev server.
 *
 * Why a separate, pure module: these checks decide whether the script may touch a database at
 * all, so they deserve unit tests. A pure function (file text in, verdict out) is testable
 * without a database, without files on disk and without process.env. The script reads the files
 * and hands their text over.
 *
 * Why the files and not process.env: Next.js and Prisma give a set DATABASE_URL precedence over
 * .env, and Vitest's setup loads .env.test into process.env. Reading .env's own text is the only
 * way to be sure we use the dev branch's values (mydevspace spec 2026-10-08 §2, §8.3).
 */

/** What the guard looks at: the raw text of .env and .env.test (null when a file is missing) and NODE_ENV. */
export type DevSessionGuardInput = {
  devEnvText: string | null;
  testEnvText: string | null;
  nodeEnv: string | undefined;
};

/** Either the dev values the script may use, or the reason it must stop (a discriminated union on `ok`). */
export type DevSessionGuardResult =
  | { ok: true; databaseUrl: string; authSecret: string }
  | { ok: false; reason: string };

/**
 * The Neon endpoint a connection URL points at, e.g. "ep-cool-river-123456" for both
 * "ep-cool-river-123456-pooler.eu-central-1.aws.neon.tech" (pooled) and the direct host.
 *
 * Why endpoints instead of whole URLs: the same branch can be reached with a different user,
 * password, database name, query string or through the pooler. Comparing the endpoint catches
 * all of those. Hosts outside neon.tech fall back to the full host name.
 * Returns null for text that is not a URL, which callers treat as "cannot prove it is safe".
 */
export function neonEndpoint(url: string): string | null {
  let host: string;
  try {
    // The WHATWG URL parser understands postgresql:// URLs well enough to give us the host.
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === "") return null;
  if (!host.endsWith(".neon.tech")) return host;
  // Neon hosts look like <endpoint>[-pooler].<region>.aws.neon.tech; the endpoint is the first label.
  return host.split(".")[0].replace(/-pooler$/, "");
}

/**
 * Decides whether dev-session.ts may run, and with which values.
 *
 * Refuses when NODE_ENV is production, when .env is missing or lacks DATABASE_URL or AUTH_SECRET,
 * when DATABASE_URL is not a URL, or when .env and .env.test point at the same Neon endpoint (then
 * the "dev" users would land in the test branch, which every test run truncates, or worse, the
 * two files were mixed up). A missing .env.test is fine: there is nothing to compare, and in the
 * devspace runner no production URL exists at all.
 */
export function checkDevSessionEnv(input: DevSessionGuardInput): DevSessionGuardResult {
  // Cheapest check first: a production process must never mint sessions.
  if (input.nodeEnv === "production") {
    return { ok: false, reason: "NODE_ENV is production; this script is for the local dev server only" };
  }
  if (input.devEnvText === null) {
    return {
      ok: false,
      reason: ".env is missing (in the devspace runner it is written at every start; in a worktree run devspace-env-files --into)",
    };
  }
  // dotenv's parse() reads the text without touching process.env (unlike config()).
  const dev = parse(input.devEnvText);
  if (!dev.DATABASE_URL) return { ok: false, reason: ".env has no DATABASE_URL" };
  if (!dev.AUTH_SECRET) return { ok: false, reason: ".env has no AUTH_SECRET (needed to sign the session cookie)" };

  const devEndpoint = neonEndpoint(dev.DATABASE_URL);
  if (devEndpoint === null) return { ok: false, reason: ".env's DATABASE_URL is not a URL" };

  if (input.testEnvText !== null) {
    const test = parse(input.testEnvText);
    if (test.DATABASE_URL && neonEndpoint(test.DATABASE_URL) === devEndpoint) {
      return {
        ok: false,
        reason: `.env and .env.test use the same Neon endpoint (${devEndpoint}); .env must be the dev branch`,
      };
    }
  }
  return { ok: true, databaseUrl: dev.DATABASE_URL, authSecret: dev.AUTH_SECRET };
}
