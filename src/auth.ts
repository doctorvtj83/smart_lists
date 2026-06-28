import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";
import {
  handleSignIn,
  enrichToken,
  enrichSession,
  isRequestAuthorized,
} from "@/lib/auth/callbacks";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // Auth.js defaults to AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET, but the project plan standardizes on these names.
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  // JWT sessions keep the MVP schema small: Auth.js does not need its own session table.
  session: { strategy: "jwt" },
  pages: {
    // The product owns the visible auth screens; Task 8 adds these pages.
    signIn: "/login",
    error: "/auth/error",
  },
  // The callback bodies live in @/lib/auth/callbacks so they can be unit-tested
  // in isolation; here we only bind them to the production Prisma singleton.
  callbacks: {
    // Auth.js v5 only blocks middleware-matched routes when this callback says the request is authorized.
    authorized({ auth }) {
      return isRequestAuthorized(auth);
    },

    // This callback is the OAuth gate: returning false rejects users before app access is created.
    signIn({ profile }) {
      return handleSignIn(prisma, profile);
    },

    // The JWT carries app-specific user facts so every later request can authorize without a session table.
    jwt({ token, profile }) {
      return enrichToken(prisma, token, profile);
    },

    // Mirroring token fields into the session gives server and client code a typed app user identity.
    session({ session, token }) {
      return enrichSession(session, token);
    },
  },
});
