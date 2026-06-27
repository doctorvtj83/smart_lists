import { execSync } from "node:child_process";
import { config } from "dotenv";
import { beforeAll } from "vitest";

// Load .env.test before Prisma opens any connection so tests never point at the
// developer database by accident. override: true makes the test DB authoritative.
config({ path: ".env.test", override: true });

beforeAll(() => {
  // migrate deploy applies committed migrations without generating new files,
  // which keeps the test DB aligned with the schema in local runs and CI.
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
});
