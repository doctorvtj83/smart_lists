# Slice 21 — `middleware` → `proxy` Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deprecated `src/middleware.ts` with `src/proxy.ts` (Next.js 16), so the build no
longer prints the deprecation warning. Auth gating behaves exactly as before: same matcher, same
redirect to `/login`, same exemptions.

**Architecture:** A maintenance slice that renames the file and changes nothing else. The auth gate
stays `NextAuth(authConfig).auth`, built from the lean `@/auth.config` and not from `@/auth`. The one
real change underneath is the **runtime**: Next 16 runs `proxy` on Node.js, and that cannot be
configured. The Edge runtime that motivated the `auth.config` split and its 1 MB bundle cap goes
away. **Decision (taken here, so no brainstorming session):** keep the split and keep the bundle
guard test, but restate *why*. The proxy runs on every matched request. Importing Prisma there would
create a client and connection pool in the request gate for a check that only verifies a JWT. The
split costs nothing to keep, and removing it buys nothing.

**Tech Stack:** Next.js 16.2.9 (App Router), Auth.js `next-auth@5.0.0-beta.31`, Vitest.

**Spec:** No product spec. This plan argues from the Next.js docs that ship with the installed
version (read them, not memory — see `AGENTS.md`):
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` § "`middleware` to `proxy`"
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
  (§ Exports, § Runtime, § Migration to Proxy)

## Global Constraints

- The file must export a single function, "either as a default export or named `proxy`". The docs
  recommend "changing the function name to `proxy`, even if you are using a default export". Use the
  **named `proxy` export**.
- "The `runtime` config option is not available in Proxy files. Setting the `runtime` config option in
  Proxy will throw an error." Do not add one.
- Having both `middleware.ts` and `proxy.ts` is a **build error** ("Both middleware file … and proxy
  file … are detected"). Use `git mv` and never leave both files in place.
- `config.matcher` must stay **byte-identical** to the current string. Next analyzes it statically, so
  it must stay a literal constant.
- No `next.config.ts` flags need renaming: the repo uses none of the `*Middleware*` flags (such as
  `skipMiddlewareUrlNormalize`).
- Do not use `unstable_doesProxyMatch`. The docs name it, but the installed 16.2.9 only exports
  `unstable_doesMiddlewareMatch`, and the matcher test cannot load `next/server` under Vitest anyway
  (see the mock comment in the test). Keep the existing regex-based matcher test.
- The CLAUDE.md code documentation standard applies: every changed comment explains *why*. **Never
  thin out existing comments.** The Edge/1 MB history stays in the text and is marked as history.
- Deploying is a PR, never a push to `main` and never `gh pr merge`. The slice has **no migration**,
  so the migration gate does not apply.

## Review Focus

1. **Signed-in requests must still pass the gate.** If the `session` callback is not on the proxy's
   NextAuth instance, every request looks signed out, and the result is an endless `/login` loop.
   This is pinned by the existing "still authorizes requests through the shared auth config" test,
   carried over in Task 1, and walked in the Task 3 UAT.
2. **Exempt routes stay reachable without a session:** `/offline` (the service worker precaches it),
   `/dev/ui`, `/sw.js`, `/manifest.webmanifest`, icons and `/api/auth/*`. The carried-over matcher
   assertions pin these in Task 1, and the curl checks in Task 3 confirm them.
3. **A signed-out deep link redirects to `/login` and keeps a `callbackUrl`.** This is the visible
   behavior of the Auth.js gate. Task 3 checks it with curl.
4. **Server Actions** are POSTs to the route that uses them, so they pass through the same proxy.
   After the runtime switch, a signed-in mutation must still work. Task 3 UAT adds an entry.
5. **The proxy must not pull in Prisma now that the Edge cap is gone.** The renamed bundle guard in
   Task 1 pins this.

---

### Task 1: Rename the file convention and its two tests

**Files:**
- Rename: `src/middleware.ts` → `src/proxy.ts`
- Rename: `src/middleware.test.ts` → `src/proxy.test.ts`
- Rename: `src/test/middleware-edge-bundle.test.ts` → `src/test/proxy-bundle.test.ts`

**Interfaces:**
- Produces: `src/proxy.ts` exports `proxy` (the Auth.js `auth` function from
  `NextAuth(authConfig)`) and `config` (`{ matcher: string[] }`, unchanged). Nothing in `src/`
  imports this module except its two tests.

- [ ] **Step 1: Rename the tests with `git mv` and point them at the new module**

In `src/proxy.test.ts`: import `{ config, proxy } from "./proxy"`, rename the helper
`middlewareApplies` → `proxyApplies` and the describe block → `"proxy matcher"`, and keep every
existing assertion. Add one test:

```ts
it("exports the gate under the recommended `proxy` name", () => {
  expect(proxy).toBeTypeOf("function");
});
```

In `src/test/proxy-bundle.test.ts`: walk `src/proxy.ts` instead of `src/middleware.ts`, rename the
describe block → `"proxy bundle"`, and change the failure message to say that importing Prisma puts
a database client into the request gate on every matched request. Keep the 2026-09-06 Edge incident
in the header comment as the history of why the guard exists, and add a paragraph explaining why it
still matters under the Node.js runtime (see Architecture).

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/proxy.test.ts src/test/proxy-bundle.test.ts`
Expected: FAIL. `./proxy` cannot be resolved, and the bundle walk cannot find `src/proxy.ts`.

- [ ] **Step 3: `git mv src/middleware.ts src/proxy.ts` and switch to the named export**

Replace `export default NextAuth(authConfig).auth;` with `export const proxy = NextAuth(authConfig).auth;`.
Leave `config` alone. Update the header comment: name the Next 16 rename and the Node.js-only
runtime (quote the docs path), keep the paragraph on why this is built from `@/auth.config` and
mark it as history, and point to `src/test/proxy-bundle.test.ts`. Also rename "middleware" →
"proxy" in the matcher comment.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/proxy.test.ts src/test/proxy-bundle.test.ts`
Expected: PASS, and every assertion carried over from the old matcher test is still there.

- [ ] **Step 5: Confirm the build drops the deprecation warning**

Run: `npm run build 2>&1 | grep -iE 'deprecated|proxy|middleware'`
Expected: no `The "middleware" file convention is deprecated` line, no "Both middleware file … and
proxy file" error, and a `Proxy` row in the route summary. (The `turbopack.root` workspace-root
warning in a worktree is unrelated. It comes from the parent checkout's lockfile.)

- [ ] **Step 6: Commit**

```bash
git add -A src/proxy.ts src/proxy.test.ts src/test/proxy-bundle.test.ts src/middleware.ts src/middleware.test.ts src/test/middleware-edge-bundle.test.ts
git commit -m "refactor(auth): migrate middleware.ts to the Next 16 proxy convention"
```

---

### Task 2: Update every comment that names the middleware

**Files (comments only, no logic changes):**
- Modify: `src/auth.ts` (JSDoc on the config split)
- Modify: `src/auth.config.ts` (header block: the split rationale and the bundle-test path)
- Modify: `src/lib/auth/callbacks.ts`, `src/lib/auth/callbacks.test.ts` (describe title
  `"isRequestAuthorized (middleware predicate)"` → `"isRequestAuthorized (proxy predicate)"`),
  `src/lib/auth/session.ts`, `src/types/next-auth.d.ts`
- Modify: `src/app/manifest.ts`, `src/app/offline/page.tsx`, `src/app/page.tsx`,
  `src/app/projects/page.tsx`, `src/app/projects/[projectId]/layout.tsx`,
  `src/app/projects/[projectId]/page.tsx`, `src/app/projects/[projectId]/katalog/page.tsx`,
  `src/app/projects/[projectId]/rezepte/page.tsx`,
  `src/app/projects/[projectId]/einstellungen/page.tsx`, `src/app/lists/[listId]/page.tsx`

**Interfaces:** none. This task changes only comments and one test title.

- [ ] **Step 1: Rewrite the references**

`middleware.ts` becomes `proxy.ts`, and "the middleware" becomes "the proxy". In `auth.ts` and
`auth.config.ts`, the "too large for an Edge Function" reasoning becomes the current reason (keep
Prisma out of the request gate, see Architecture), and the Edge incident stays as dated history.
Keep the "defense in depth" wording in `session.ts`. The docs say the same thing
(`proxy.md`: "Always verify authentication and authorization inside each Server Function rather than
relying on Proxy alone").

- [ ] **Step 2: Confirm that only history mentions the middleware**

Run: `grep -rn -i "middleware" src`
Expected: matches only in sentences that are clearly history (the 2026-09-06 Edge incident, the
`_middleware` error text) and in the `next-auth` type name `NextAuthMiddleware` if it appears. None
should describe the current file.

- [ ] **Step 3: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass (count = baseline + 1 from Task 1), and lint shows 0 errors and the
inherited 14 warnings.

- [ ] **Step 4: Commit**

```bash
git commit -am "docs(auth): describe the request gate as proxy.ts on the Node.js runtime"
```

---

### Task 3: Verify behavior in the running app and close the slice

**Files:**
- Create: `docs/implementation-reviews/slice-21-middleware-to-proxy.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` (add a Slice 21 row
  with the ✅ status, a progress-log entry, and drop `middleware` → `proxy` from the open items)
- Modify: `docs/deployment/2026-09-06-production-deploy-runbook.md` (*Known limitations*: replace
  the "still open" bullet with a one-line note that it was resolved in Slice 21, and add a note under
  the "Edge-bundle trap" box that the gate is now `src/proxy.ts` on Node.js and the guard was renamed
  to `src/test/proxy-bundle.test.ts`)

- [ ] **Step 1: Run signed-out checks against the dev server**

Start `npm run dev`, then:

```bash
b=http://localhost:3000
curl -s -o /dev/null -w '/ %{http_code} %{redirect_url}\n' "$b/"                          # 307 → /login…
curl -s -o /dev/null -w 'deep %{http_code} %{redirect_url}\n' "$b/projects/x/katalog"     # 307 → /login?callbackUrl=…
for p in /login /offline /dev/ui /sw.js /manifest.webmanifest /api/auth/providers; do
  curl -s -o /dev/null -w "$p %{http_code}\n" "$b$p"                                       # all 200
done
```

Expected: exactly the codes in the comments, and no deprecation warning in the dev-server log.

- [ ] **Step 2: Run signed-in UAT as the owner (CLAUDE.md → *Signed-in UAT*)**

Using `npx tsx scripts/dev-session.ts owner` and the `devspace-playwright` browser:
`/api/auth/session` shows `uat-owner@example.test`. Open `/projects/<projectId>`, which loads without
a redirect loop. Open a list and add an entry in the trailing row, which is a Server Action through
the proxy. After a reload, the entry is still there. Sign out ("Abmelden"), and `/projects` redirects
to `/login` again.

- [ ] **Step 3: Write the implementation review and update the meta plan and the runbook**

The review follows the five sections that CLAUDE.md requires. Its key lines are the `proxy` export,
the unchanged matcher, and the bundle guard's new rationale. It states that there is no migration
and that the runtime is now Node.js. Report the UAT steps exactly as you performed them.

- [ ] **Step 4: Run the final check**

Run: `npm test && npm run lint && npm run build`
Expected: all green, with no middleware deprecation warning in the build output.

- [ ] **Step 5: Commit, push, open a PR**

```bash
git add docs && git commit -m "docs: add the Slice 21 implementation review and close the proxy item"
git push -u origin chore/middleware-to-proxy
gh pr create --title "chore: migrate middleware.ts to the Next 16 proxy convention (Slice 21)" ...
```

The PR body says: no migration, runtime is now Node.js, the matcher is unchanged. The owner merges.
After the merge, the CLAUDE.md post-merge curl check applies when the owner asks for it.
