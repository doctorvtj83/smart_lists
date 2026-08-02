// Reuses Auth.js middleware so protected pages redirect to the configured /login page without custom glue.
export { auth as middleware } from "@/auth";

export const config = {
  // Keep auth endpoints, auth pages, the Slice-13 /dev gallery, Next internals, and public
  // files with extensions reachable without a session. /dev/* is excluded because the gallery
  // is the manual verification surface for design primitives and must open unauthenticated —
  // the page itself still 404s in production via NODE_ENV.
  // Anchor `dev` as `dev(?:/|$)` so only `/dev` and `/dev/...` skip auth —
  // an unanchored `dev` would also exempt `/devices`, `/developer`, etc.
  matcher: ["/((?!api/auth|login|auth/error|dev(?:/|$)|_next/static|_next/image|.*\\..*).*)"],
};
