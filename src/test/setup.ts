import { config } from "dotenv";
import { afterEach } from "vitest";

// Load .env.test before Prisma opens any connection so tests never point at the
// developer database by accident. override: true makes the test DB authoritative.
config({ path: ".env.test", override: true });

// Component tests opt into a DOM by putting `// @vitest-environment jsdom` at the
// top of the file. setupFiles runs once per test file INSIDE that file's
// environment, so this guard is how one shared setup serves both worlds: the
// node-environment DB tests have no `document` and skip everything below.
if (typeof document !== "undefined") {
  // Testing Library only registers its own afterEach cleanup when Vitest's
  // globals are enabled. This project imports test helpers explicitly instead,
  // so we wire the cleanup ourselves — without it, renders from earlier tests
  // stay in document.body and getByRole finds duplicates.
  const { cleanup } = await import("@testing-library/react");
  // jest-dom adds the DOM matchers (toBeInTheDocument, toHaveAttribute, …) and
  // must be imported before any assertion runs, which is exactly what a setup
  // file guarantees.
  await import("@testing-library/jest-dom/vitest");
  afterEach(() => cleanup());
}
