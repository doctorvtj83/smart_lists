import { describe, it, expect, vi } from "vitest";

// This file only asserts the matcher, but importing ./middleware evaluates
// `NextAuth(authConfig)` at module scope, and next-auth's env helper imports
// "next/server", which Vitest's node resolver cannot load outside a Next.js
// runtime. Stubbing the NextAuth factory keeps the import side-effect-free.
// (Before the edge split this mocked "@/auth" instead — the middleware no
// longer imports it, so the mock had to move down a level with it.)
vi.mock("next-auth", () => ({ default: () => ({ auth: () => undefined }) }));

import { config } from "./middleware";

/**
 * Whether the middleware matcher selects a pathname (auth would run).
 * Compiles the Next.js matcher string as a RegExp — our matcher is already
 * regex-shaped, so this mirrors how the negative-lookahead exclusions behave.
 */
function middlewareApplies(pathname: string): boolean {
  const matcher = config.matcher[0] as string;
  return new RegExp(`^${matcher}$`).test(pathname);
}

describe("middleware matcher", () => {
  it("excludes only /dev and /dev/* — not /devices or /developer", () => {
    expect(middlewareApplies("/dev")).toBe(false);
    expect(middlewareApplies("/dev/ui")).toBe(false);
    expect(middlewareApplies("/devices")).toBe(true);
    expect(middlewareApplies("/developer")).toBe(true);
  });

  it("excludes only /offline — not /offline-mode", () => {
    // The service worker precaches this route at install time, before any user
    // has signed in. Without the exemption it would cache a /login redirect and
    // every offline navigation would show the login screen instead.
    expect(middlewareApplies("/offline")).toBe(false);
    expect(middlewareApplies("/offline-mode")).toBe(true);
  });

  it("leaves the PWA files reachable without a session", () => {
    // These pass through the matcher's `.*\..*` dot exclusion, not a named rule —
    // pinned here so a future matcher edit cannot break installability silently.
    expect(middlewareApplies("/sw.js")).toBe(false);
    expect(middlewareApplies("/manifest.webmanifest")).toBe(false);
    expect(middlewareApplies("/icons/icon-192.png")).toBe(false);
    expect(middlewareApplies("/apple-touch-icon.png")).toBe(false);
  });

  it("still excludes auth pages and static assets", () => {
    expect(middlewareApplies("/login")).toBe(false);
    expect(middlewareApplies("/api/auth/callback/google")).toBe(false);
    expect(middlewareApplies("/auth/error")).toBe(false);
    expect(middlewareApplies("/favicon.ico")).toBe(false);
  });

  it("still protects app routes", () => {
    expect(middlewareApplies("/")).toBe(true);
    expect(middlewareApplies("/projects")).toBe(true);
    expect(middlewareApplies("/admin")).toBe(true);
  });
});
