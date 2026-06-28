import type { DefaultSession } from "next-auth";

// Extends Auth.js with app-specific session fields populated from the JWT callback.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
}

// The JWT stores the database user identity so middleware and server code can avoid a session table.
declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    isAdmin?: boolean;
  }
}
