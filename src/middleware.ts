import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Reuses Auth.js middleware so protected pages redirect to the configured /login page without custom glue.
//
// Built from @/auth.config and NOT from @/auth on purpose. @/auth binds the
// Prisma singleton, and this file is compiled into an Edge Function whose bundle
// Vercel caps at 1 MB on the Hobby plan — importing it dragged in the Prisma
// query-engine WASM (1.02 MB) and made the first production deploy fail. The
// checks this middleware performs are a JWT signature verification plus the
// pure `isRequestAuthorized` predicate; neither needs a database.
// src/test/middleware-edge-bundle.test.ts guards the boundary.
export default NextAuth(authConfig).auth;

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
