import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

/**
 * Guards the one property of src/middleware.ts that cannot be seen by reading it:
 * what its *transitive* imports drag into the Edge bundle.
 *
 * Why this test exists: the first production deploy (2026-09-06) failed with
 * `The Edge Function "_middleware" size is 1.02 MB and your plan size limit is
 * 1 MB`. The cause was invisible in the middleware source — it imported `@/auth`,
 * which imports the Prisma singleton from `@/lib/db`, so the Prisma query-engine
 * WASM ended up inside an Edge function that never runs a single query. The
 * middleware only evaluates `isRequestAuthorized`, a pure boolean over the JWT.
 *
 * Pattern: static module-graph walk. A runtime import cannot prove absence —
 * importing the module under test would itself pull Prisma in — so we parse the
 * import statements instead and follow them across the repo's own files. It is
 * a lint rule expressed as a test: cheap, no build step, and it fails at the
 * moment someone reintroduces the dependency rather than 50 seconds into a
 * Vercel deploy.
 */

// Specifiers that must never be reachable from the middleware at runtime.
// `@prisma/client` is the direct offender; `@/lib/db` is the path that pulled it
// in, named separately so a failure message points at the actual mistake.
const FORBIDDEN = ["@prisma/client", "@/lib/db"];

// Two patterns, because a re-export is an edge in the graph just like an import
// — `src/middleware.ts` reached Prisma through `export { auth as middleware }
// from "@/auth"`, and a scanner that only looked for `import` walked straight
// past it. Both capture (1) the `type` keyword if present and (2) the
// specifier; `import type`/`export type` are erased by TypeScript and never
// reach the bundle, so they must not count as edges.
//
// The import pattern lets the clause span newlines (this codebase has
// multi-line `import { a, b } from "…"`), which is safe because the character
// class excludes quotes and semicolons. The re-export pattern deliberately does
// NOT span newlines: `from` is mandatory there, and allowing newlines would let
// `export const config = { matcher: ["…"] }` masquerade as a re-export.
const IMPORT_RE = /^\s*import\s+(type\s+)?(?:[^;'"]*?\bfrom\s*)?["']([^"']+)["']/gm;
const REEXPORT_RE = /^\s*export\s+(type\s+)?[^;'"\n]*?\bfrom\s*["']([^"']+)["']/gm;

/**
 * Turns an import specifier into a file inside src/, or null for anything that
 * is not one of our own modules (npm packages, node: builtins).
 *
 * The extension guessing mirrors what the TS resolver does for `@/x` and `./x`
 * — we only need the four shapes this repo actually uses.
 */
function resolveLocal(specifier: string, importerFile: string): string | null {
  const src = resolve(process.cwd(), "src");
  const base = specifier.startsWith("@/")
    ? resolve(src, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(importerFile), specifier)
      : null;
  if (base === null) return null;

  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Walks the import graph from an entry file and returns every specifier reached,
 * plus the chain that led there. The chain is what makes a failure actionable:
 * "middleware → auth → lib/db" tells you exactly which edge to cut.
 */
function collectRuntimeImports(entry: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const visited = new Set<string>();
  // Explicit stack instead of recursion: the graph has cycles (session.ts
  // imports @/auth, which is reachable from it), and a visited-set + stack is
  // the simplest form that cannot blow up on one.
  const stack: Array<{ file: string; chain: string[] }> = [{ entry, chain: [] }].map((s) => ({
    file: s.entry,
    chain: [relative(process.cwd(), s.entry)],
  }));

  while (stack.length > 0) {
    const { file, chain } = stack.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    const source = readFileSync(file, "utf8");
    const edges = [...source.matchAll(IMPORT_RE), ...source.matchAll(REEXPORT_RE)];
    for (const match of edges) {
      const [, typeKeyword, specifier] = match;
      if (typeKeyword) continue; // `import type` / `export type` is erased at compile time.

      if (!found.has(specifier)) found.set(specifier, chain);

      const local = resolveLocal(specifier, file);
      if (local !== null) stack.push({ file: local, chain: [...chain, specifier] });
    }
  }

  return found;
}

describe("middleware Edge bundle", () => {
  it("never reaches Prisma at runtime", () => {
    const imports = collectRuntimeImports(resolve(process.cwd(), "src/middleware.ts"));

    for (const specifier of FORBIDDEN) {
      const chain = imports.get(specifier);
      expect(
        chain,
        `src/middleware.ts must not import ${specifier} at runtime — it bundles the ` +
          `Prisma query engine into the Edge function and breaks the 1 MB deploy limit. ` +
          `Reached via: ${chain?.join(" -> ")}`
      ).toBeUndefined();
    }
  });

  it("still authorizes requests through the shared auth config", async () => {
    // The split must not silently drop the two callbacks the middleware depends
    // on: `authorized` decides the redirect, and `session` is what puts
    // `user.id` on the session object that `authorized` reads. Losing `session`
    // would make every request look unauthenticated — an infinite /login loop.
    const { authConfig } = await import("@/auth.config");

    expect(authConfig.callbacks?.authorized).toBeTypeOf("function");
    expect(authConfig.callbacks?.session).toBeTypeOf("function");
  });
});
