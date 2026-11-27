import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Reuses the Auth.js gate so protected pages redirect to the configured /login page without custom glue.
//
// Next 16 renamed the `middleware` file convention to `proxy` (see
// node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md) and runs
// it on Node.js only; the runtime is not configurable. The docs recommend the
// named `proxy` export even though a default export is still accepted.
//
// Built from @/auth.config and NOT from @/auth on purpose. History: @/auth binds
// the Prisma singleton, and as middleware this file was compiled into an Edge
// Function whose bundle Vercel caps at 1 MB on the Hobby plan — importing it
// dragged in the Prisma query-engine WASM (1.02 MB) and made the first
// production deploy fail (2026-09-06). The Edge cap is gone on Node.js, but the
// split stays: the proxy runs on every matched request, and the checks it
// performs are a JWT signature verification plus the pure `isRequestAuthorized`
// predicate; neither needs a database or a connection pool.
// src/test/proxy-bundle.test.ts guards the boundary.
export const proxy = NextAuth(authConfig).auth;

export const config = {
  // Keep auth endpoints, auth pages, the Slice-13 /dev gallery, the PWA offline
  // fallback, Next internals, and public files with extensions reachable without
  // a session. /dev/* is excluded because the gallery is the manual verification
  // surface for design primitives and must open unauthenticated — the page itself
  // still 404s in production via NODE_ENV. /offline is excluded because the
  // service worker precaches it during install, when there is no session yet;
  // gated, it would cache a /login redirect and every offline navigation would
  // land on the login screen.
  // Anchor `dev` and `offline` as `…(?:/|$)` so only the exact route and its
  // children skip auth — unanchored, they would also exempt `/devices`,
  // `/developer`, `/offline-mode`, etc.
  matcher: [
    "/((?!api/auth|login|auth/error|dev(?:/|$)|offline(?:/|$)|_next/static|_next/image|.*\\..*).*)",
  ],
};
