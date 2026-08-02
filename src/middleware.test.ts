import { describe, it, expect, vi } from "vitest";

// Auth.js pulls Prisma and Google OAuth env; this file only asserts the matcher.
vi.mock("@/auth", () => ({ auth: () => undefined }));

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
