import { execSync } from "node:child_process";
import { config } from "dotenv";

// Runs once for the entire Vitest invocation, before any test files start.
// This is the right place for schema migration because setupFiles run per file.
export default function globalSetup(): void {
  // Load .env.test in this process first so the child Prisma command inherits
  // the test DATABASE_URL instead of falling back to the developer database.
  config({ path: ".env.test", override: true });

  // migrate deploy applies existing migrations without generating new files,
  // which keeps local and CI test databases aligned with the committed schema.
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
}
