// Reuses Auth.js middleware so protected pages redirect to the configured /login page without custom glue.
export { auth as middleware } from "@/auth";

export const config = {
  // Keep auth endpoints, auth pages, Next internals, and public files with extensions reachable without a session.
  matcher: ["/((?!api/auth|login|auth/error|_next/static|_next/image|.*\\..*).*)"],
};
