import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // tsconfigPaths makes the "@/*" alias from tsconfig.json usable in tests.
  plugins: [tsconfigPaths()],
  test: {
    // node environment: this slice tests server/DB logic, no DOM.
    environment: "node",
    // The global setup migrates the test DB once before test files start.
    globalSetup: ["./src/test/global-setup.ts"],
    // Each test file still loads .env.test before creating Prisma clients.
    setupFiles: ["./src/test/setup.ts"],
    // DB tests mutate shared tables, so files must run serially to stay isolated.
    fileParallelism: false,
  },
});
