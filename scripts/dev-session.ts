/**
 * UAT helper: signs an agent's headless browser into the LOCAL dev server without Google.
 *
 * Why it exists: Google OAuth cannot be automated, so agents could not see signed-in pages. This
 * script upserts two fixed UAT users and a UAT project into the dev database, then prints an
 * Auth.js session cookie for one of them. The browser sets that cookie and is signed in, exactly
 * as after a real Google login (mydevspace spec 2026-10-08 §8.3).
 *
 * Usage: npx tsx scripts/dev-session.ts owner|member
 * Output: one JSON line {name, value, domain, path, projectId, user}.
 *
 * Safety: the values come from .env's text only (scripts/dev-session-guard.ts), never from
 * process.env, and the guard refuses anything that is not clearly the dev branch. A cookie signed
 * with the dev AUTH_SECRET is worthless in production, whose secret differs.
 */
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { createProject } from "../src/lib/projects/projects";
import { checkDevSessionEnv } from "./dev-session-guard";

// Auth.js v5 names its session cookie "authjs.session-token" over plain http (localhost); over
// https it would be "__Secure-authjs.session-token". The name doubles as the encryption salt.
const COOKIE_NAME = "authjs.session-token";

// The two fixed UAT identities. googleSub is the unique key the app's users table is keyed on;
// a value no real Google account can have keeps them apart from real users. The .test TLD is
// reserved (RFC 2606), so these addresses can never receive mail.
const UAT_USERS = {
  owner: { googleSub: "devspace-uat-owner", email: "uat-owner@example.test", displayName: "UAT Owner" },
  member: { googleSub: "devspace-uat-member", email: "uat-member@example.test", displayName: "UAT Member" },
} as const;

// The project the owner owns and the member belongs to; German like every in-app string.
const UAT_PROJECT_NAME = "UAT-Projekt";

// Eight hours: long enough for a walkthrough, short enough that a leaked dev cookie expires soon.
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

type Role = keyof typeof UAT_USERS;

/** Reads a file's text, or null when it does not exist (the guard decides what that means). */
function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Entry point: validate the role, run the guard, upsert the fixtures, print the cookie. */
async function main(): Promise<void> {
  const role = process.argv[2];
  if (role !== "owner" && role !== "member") {
    console.error("usage: npx tsx scripts/dev-session.ts owner|member");
    process.exit(2);
  }

  // Paths are relative to the working directory: run from the repo (or worktree) root.
  const guard = checkDevSessionEnv({
    devEnvText: readIfExists(".env"),
    testEnvText: readIfExists(".env.test"),
    nodeEnv: process.env.NODE_ENV,
  });
  if (!guard.ok) {
    console.error(`dev-session: refusing: ${guard.reason}`);
    process.exit(1);
  }

  // datasourceUrl overrides whatever DATABASE_URL the process env or Prisma's own .env loading
  // would supply, so the connection is exactly the guarded dev URL.
  const db = new PrismaClient({ datasourceUrl: guard.databaseUrl });
  try {
    // Upsert (create if missing, otherwise leave as is) keeps the script idempotent: every run
    // reuses the same users and project instead of piling up copies in the dev branch.
    const [owner, member] = await Promise.all(
      (["owner", "member"] as const).map((r) =>
        db.user.upsert({
          where: { googleSub: UAT_USERS[r].googleSub },
          update: {},
          create: { ...UAT_USERS[r], isAdmin: false },
        }),
      ),
    );

    // Reuse the owner's UAT project if it exists; createProject (the app's own function) also
    // writes the owner Membership row in the same transaction, so the fixture matches real data.
    const project =
      (await db.project.findFirst({ where: { ownerId: owner.id, name: UAT_PROJECT_NAME } })) ??
      (await createProject(db, { name: UAT_PROJECT_NAME, ownerId: owner.id }));

    // The member's Membership, keyed on the (projectId, userId) unique constraint.
    await db.membership.upsert({
      where: { projectId_userId: { projectId: project.id, userId: member.id } },
      update: { role: "member" },
      create: { projectId: project.id, userId: member.id, role: "member" },
    });

    const user = (role as Role) === "owner" ? owner : member;
    // The token carries what the app's jwt callback (src/lib/auth/callbacks.ts, enrichToken)
    // puts there after a real sign-in: userId and isAdmin. sub mirrors Google's subject claim.
    const value = await encode({
      token: { sub: user.googleSub, email: user.email, name: user.displayName, userId: user.id, isAdmin: user.isAdmin },
      secret: guard.authSecret,
      salt: COOKIE_NAME,
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    console.log(
      JSON.stringify({ name: COOKIE_NAME, value, domain: "localhost", path: "/", projectId: project.id, user: user.email }),
    );
  } finally {
    // Always release the connection, or the script would hang on the open pool.
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("dev-session: failed:", err);
  process.exit(1);
});
