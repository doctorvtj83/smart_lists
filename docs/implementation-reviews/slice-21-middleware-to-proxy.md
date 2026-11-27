# Slice 21 — `middleware` → `proxy` migration

## 1. What was achieved
Next.js 16 deprecated the `middleware` file convention in favor of `proxy`. The auth gate is now
`src/proxy.ts`; the build no longer prints the deprecation warning. Behavior is unchanged: same matcher,
same redirect to `/login` (with `callbackUrl`), same exemptions. Fully met. **No migration.** The one real
change underneath: Next 16 runs the proxy on **Node.js** (not configurable), so the Edge runtime and its
1 MB bundle cap are gone.

## 2. Steps taken
1. `git mv` of `middleware.ts`, its matcher test and the Edge-bundle test to `proxy.ts`,
   `proxy.test.ts`, `test/proxy-bundle.test.ts`; switched to the named `proxy` export; added a test
   that the export is a function; restated the bundle guard's rationale.
2. Rewrote every comment that named the middleware (auth, auth.config, session, callbacks, pages,
   manifest, offline page); the Edge incident stays as dated history.
3. Verified in the running app, updated the meta plan and the deploy runbook.

## 3. Core components
- `src/proxy.ts` — the request gate: `NextAuth(authConfig).auth` exported as `proxy`, plus `config.matcher`.
- `src/proxy.test.ts` — pins the matcher exemptions and the `proxy` export.
- `src/test/proxy-bundle.test.ts` — static import-graph walk that fails if Prisma becomes reachable from the proxy; also pins that `authConfig` keeps `authorized` and `session`.

## 4. Most important lines
```ts
export const proxy = NextAuth(authConfig).auth;
```
Next 16 looks for a `proxy` export (or default); the docs recommend the named one.

```ts
"/((?!api/auth|login|auth/error|dev(?:/|$)|offline(?:/|$)|_next/static|_next/image|.*\\..*).*)",
```
The matcher, unchanged. It must stay a literal since Next analyzes it statically; it keeps `/offline`
(precached by the service worker), `/dev/ui`, PWA files and auth routes reachable without a session.

```ts
const FORBIDDEN = ["@prisma/client", "@/lib/db"];
```
The bundle guard. Its reason changed: not the Edge cap, but keeping a database client and connection
pool out of a gate that runs on every matched request and only verifies a JWT.

```ts
import { authConfig } from "@/auth.config";   // not "@/auth"
```
The split between the lean and the Prisma-backed config is what the guard protects.

## 5. Architecture contribution
Maintenance only: the closed-access gate (JWT check → redirect to `/login`) keeps its place in front of
all routes, now under the supported Next 16 name. Server Components and Server Functions still
re-verify the session themselves (defense in depth, as `proxy.md` recommends).

## Verification, as performed
- `npm test`: 108 files / 1002 tests passed. `npm run lint`: 0 errors, 14 inherited warnings.
  `npm run build`: compiled, route summary shows `Proxy (Middleware)`, no deprecation line or
  "both files" error.
- Signed-out curl against `npm run dev`: `/` → 307 `/login?callbackUrl=…`; `/projects/x/katalog` → 307
  with callbackUrl; `/login`, `/offline`, `/dev/ui`, `/sw.js`, `/manifest.webmanifest`,
  `/api/auth/providers` → 200. No deprecation text in the dev log.
- Signed-in browser UAT (devspace-playwright, minted `uat-owner` cookie): `/api/auth/session` showed
  `uat-owner@example.test`; the project page loaded with no redirect loop; on list "UAT Einheiten B" I
  added the entry "Proxy-Test-Brot" via the trailing row (a Server Action through the proxy) and it
  was still there after a reload; "Abmelden" led to `/login`, and `/projects` then redirected to
  `/login?callbackUrl=…`.
- Not done: member-user walk; production post-merge check (owner's call after merge). The test entry
  remains in the dev database list "UAT Einheiten B".
