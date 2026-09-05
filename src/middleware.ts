// Reuses Auth.js middleware so protected pages redirect to the configured /login page without custom glue.
export { auth as middleware } from "@/auth";

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
