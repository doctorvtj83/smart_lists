import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // tsconfigPaths makes the "@/*" alias from tsconfig.json usable in tests.
  plugins: [tsconfigPaths()],
  test: {
    // node environment: this slice tests server/DB logic, no DOM.
    environment: "node",
    // The setup file loads .env.test first and migrates the test DB once.
    setupFiles: ["./src/test/setup.ts"],
    // DB tests mutate shared tables, so files must run serially to stay isolated.
    fileParallelism: false,
  },
});
