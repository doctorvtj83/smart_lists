import NextAuth from "next-auth";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { handleSignIn, enrichToken } from "@/lib/auth/callbacks";

/**
 * The full Auth.js instance used by the app: route handlers, server components
 * and `getSessionUserId`. It is the edge-safe `authConfig` plus the two
 * callbacks that need database access.
 *
 * Why the config is split across two files: importing this module pulls in the
 * Prisma client, which is far too large for an Edge Function. `middleware.ts`
 * therefore builds its own, leaner instance from `@/auth.config` — see the
 * comment there and in auth.config.ts. Nothing outside the middleware needs the
 * lean instance; everything else runs on Node.js and should import from here.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // The callback bodies live in @/lib/auth/callbacks so they can be unit-tested
  // in isolation; here we only bind them to the production Prisma singleton.
  // Spreading authConfig.callbacks first keeps `authorized` and `session` —
  // overwriting the whole object instead of merging it would silently drop them.
  callbacks: {
    ...authConfig.callbacks,

    // This callback is the OAuth gate: returning false rejects users before app access is created.
    signIn({ profile }) {
      return handleSignIn(prisma, profile);
    },

    // The JWT carries app-specific user facts so every later request can authorize without a session table.
    jwt({ token, profile }) {
      return enrichToken(prisma, token, profile);
    },
  },
});
