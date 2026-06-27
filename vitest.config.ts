import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // tsconfigPaths makes the "@/*" alias from tsconfig.json usable in tests.
  plugins: [tsconfigPaths()],
  test: {
    // node environment: this slice tests server/DB logic, no DOM.
    environment: "node",
    // The global setup file is added in Task 3; not needed yet.
  },
});
