import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-source trees: linting these adds noise and false failures. `support.js` is the design
    // handoff's VENDORED prototype runtime (React 17-era ReactDOM.render, CommonJS `module` assigns)
    // — a reference artifact we never edit, not app code. `.remember/` is scratch/session state.
    // Ignoring them makes a red `npm run lint` mean a real problem in `src/` again.
    "docs/design/**",
    ".remember/**",
  ]),
]);

export default eslintConfig;
