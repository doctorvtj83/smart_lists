// Reuses Auth.js middleware so protected pages redirect to the configured /login page without custom glue.
export { auth as middleware } from "@/auth";

export const config = {
  // Keep auth endpoints, auth pages, the Slice-13 /dev gallery, Next internals, and public
  // files with extensions reachable without a session. /dev/* is excluded because the gallery
  // is the manual verification surface for design primitives and must open unauthenticated —
  // the page itself still 404s in production via NODE_ENV.
  matcher: ["/((?!api/auth|login|auth/error|dev|_next/static|_next/image|.*\\..*).*)"],
};
