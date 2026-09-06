import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { enrichSession, isRequestAuthorized } from "@/lib/auth/callbacks";

/**
 * The half of the Auth.js configuration that touches no database.
 *
 * Pattern: split config (the approach Auth.js documents for edge-compatible
 * middleware). `auth.ts` spreads this and adds the two Prisma-backed callbacks;
 * `middleware.ts` builds its own NextAuth instance from this file ALONE.
 *
 * Why the split is load-bearing and not cosmetic: the middleware runs as an Edge
 * Function, and Vercel's Hobby plan caps that bundle at 1 MB. When
 * `middleware.ts` re-exported `auth` from `auth.ts`, the import chain
 * `middleware -> auth -> lib/db -> @prisma/client` pulled the Prisma query-engine
 * WASM into the bundle — 1.02 MB, and the first production deploy (2026-09-06)
 * was rejected. The middleware never runs a query; it only evaluates
 * `isRequestAuthorized`, a pure boolean over the JWT. `src/test/
 * middleware-edge-bundle.test.ts` fails the build if that chain comes back.
 *
 * Note that `callbacks.session` MUST live here, not in auth.ts: `authorized`
 * reads `auth.user.id`, and `enrichSession` is what copies that id out of the
 * token onto the session. Without it in the middleware's own instance every
 * request would look signed-out and redirect to /login forever.
 */
export const authConfig = {
  // Auth.js rejects unknown hosts in NODE_ENV=production (UntrustedHost) before
  // the allowlist callback even runs. `next dev` is lenient; `next start` is not,
  // so a local production login on localhost:3000 would otherwise land on
  // /auth/error ("Zugang nicht freigeschaltet") despite a valid allowlist row.
  // Vercel sets this implicitly via VERCEL=1; we set it here so local `next start`
  // and any reverse-proxy host behave the same.
  trustHost: true,
  providers: [
    // Auth.js defaults to AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET, but the project plan standardizes on these names.
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  // JWT sessions keep the MVP schema small: Auth.js does not need its own session table.
  // This is also what makes the edge split possible at all — verifying a session
  // is a signature check, not a database lookup.
  session: { strategy: "jwt" },
  pages: {
    // The product owns the visible auth screens.
    signIn: "/login",
    error: "/auth/error",
  },
  callbacks: {
    // Auth.js v5 only blocks middleware-matched routes when this callback says the request is authorized.
    authorized({ auth }) {
      return isRequestAuthorized(auth);
    },

    // Mirroring token fields into the session gives server and client code a typed app user identity.
    session({ session, token }) {
      return enrichSession(session, token);
    },
  },
} satisfies NextAuthConfig;
