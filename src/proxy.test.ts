import { describe, it, expect, vi } from "vitest";

// This file only asserts the matcher, but importing ./proxy evaluates
// `NextAuth(authConfig)` at module scope, and next-auth's env helper imports
// "next/server", which Vitest's node resolver cannot load outside a Next.js
// runtime. Stubbing the NextAuth factory keeps the import side-effect-free.
// (Before the edge split this mocked "@/auth" instead — the proxy (then middleware) no
// longer imports it, so the mock had to move down a level with it.)
vi.mock("next-auth", () => ({ default: () => ({ auth: () => undefined }) }));

import { config, proxy } from "./proxy";

/**
 * Whether the proxy matcher selects a pathname (auth would run).
 * Compiles the Next.js matcher string as a RegExp — our matcher is already
 * regex-shaped, so this mirrors how the negative-lookahead exclusions behave.
 */
function proxyApplies(pathname: string): boolean {
  const matcher = config.matcher[0] as string;
  return new RegExp(`^${matcher}$`).test(pathname);
}

describe("proxy matcher", () => {
  it("exports the gate under the recommended `proxy` name", () => {
    // Next 16 accepts a default export or a named `proxy`; the docs recommend
    // the named one, and this pins it so a refactor cannot silently drop it.
    expect(proxy).toBeTypeOf("function");
  });

  it("excludes only /dev and /dev/* — not /devices or /developer", () => {
    expect(proxyApplies("/dev")).toBe(false);
    expect(proxyApplies("/dev/ui")).toBe(false);
    expect(proxyApplies("/devices")).toBe(true);
    expect(proxyApplies("/developer")).toBe(true);
  });

  it("excludes only /offline — not /offline-mode", () => {
    // The service worker precaches this route at install time, before any user
    // has signed in. Without the exemption it would cache a /login redirect and
    // every offline navigation would show the login screen instead.
    expect(proxyApplies("/offline")).toBe(false);
    expect(proxyApplies("/offline-mode")).toBe(true);
  });

  it("leaves the PWA files reachable without a session", () => {
    // These pass through the matcher's `.*\..*` dot exclusion, not a named rule —
    // pinned here so a future matcher edit cannot break installability silently.
    expect(proxyApplies("/sw.js")).toBe(false);
    expect(proxyApplies("/manifest.webmanifest")).toBe(false);
    expect(proxyApplies("/icons/icon-192.png")).toBe(false);
    expect(proxyApplies("/apple-touch-icon.png")).toBe(false);
  });

  it("still excludes auth pages and static assets", () => {
    expect(proxyApplies("/login")).toBe(false);
    expect(proxyApplies("/api/auth/callback/google")).toBe(false);
    expect(proxyApplies("/auth/error")).toBe(false);
    expect(proxyApplies("/favicon.ico")).toBe(false);
  });

  it("still protects app routes", () => {
    expect(proxyApplies("/")).toBe(true);
    expect(proxyApplies("/projects")).toBe(true);
    expect(proxyApplies("/admin")).toBe(true);
  });
});
