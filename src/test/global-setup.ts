import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { config, parse } from "dotenv";

// Runs once for the entire Vitest invocation, before any test files start.
// This is the right place for schema migration because setupFiles run per file.
export default function globalSetup(): void {
  // Load .env.test in this process first so the child Prisma command inherits
  // the test DATABASE_URL instead of falling back to the developer database.
  config({ path: ".env.test", override: true });

  // Safety net for a real incident: in a fresh environment .env.test didn't exist, and the
  // shortcut of copying .env's DATABASE_URL into .env.test silently pointed every test's
  // TRUNCATE (see resetDb in reset-db.ts) at the same database as local dev instead of a
  // disposable Neon test branch. dotenv's parse() (unlike config()) reads a file WITHOUT
  // touching process.env, so this compares the raw .env value against what was just loaded
  // from .env.test without disturbing the DATABASE_URL that migrate deploy is about to use.
  if (existsSync(".env")) {
    const devEnv = parse(readFileSync(".env"));
    if (devEnv.DATABASE_URL && devEnv.DATABASE_URL === process.env.DATABASE_URL) {
      throw new Error(
        ".env.test's DATABASE_URL is identical to .env's -- refusing to run tests. Tests " +
          "TRUNCATE every core table on every beforeEach (see src/test/reset-db.ts); running " +
          "them against the same database as local dev would silently destroy real data. " +
          "Point .env.test at the actual Neon `test` branch, not the dev branch.",
      );
    }
  }

  // migrate deploy applies existing migrations without generating new files,
  // which keeps local and CI test databases aligned with the committed schema.
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
}
