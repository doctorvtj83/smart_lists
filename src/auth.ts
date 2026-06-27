import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";
import { isEmailAllowed, provisionUser } from "@/lib/auth/allowlist";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  // JWT sessions keep the MVP schema small: Auth.js does not need its own session table.
  session: { strategy: "jwt" },
  pages: {
    // The product owns the visible auth screens; Task 8 adds these pages.
    signIn: "/login",
    error: "/auth/error",
  },
  callbacks: {
    // This callback is the OAuth gate: returning false rejects users before app access is created.
    async signIn({ profile }) {
      const email = profile?.email;
      if (!email) return false;
      if (!(await isEmailAllowed(prisma, email))) return false;

      // Just-in-time provisioning keeps the allowlist as the source of admission while users appear on first login.
      await provisionUser(prisma, {
        googleSub: String(profile.sub),
        email,
        displayName: (profile.name as string) ?? null,
      });
      return true;
    },

    // The JWT carries app-specific user facts so every later request can authorize without a session table.
    async jwt({ token, profile }) {
      if (profile?.sub) {
        const user = await prisma.user.findUnique({
          where: { googleSub: String(profile.sub) },
        });
        if (user) {
          token.userId = user.id;
          token.isAdmin = user.isAdmin;
        }
      }
      return token;
    },

    // Mirroring token fields into the session gives server and client code a typed app user identity.
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
  },
});
