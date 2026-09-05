import { describe, it, expect } from "vitest";
import { shouldRegisterServiceWorker } from "./register";

describe("shouldRegisterServiceWorker", () => {
  it("registers in production when the browser supports workers", () => {
    expect(shouldRegisterServiceWorker("production", true)).toBe(true);
  });

  it("never registers in development", () => {
    // A worker caching /_next/static in `next dev` serves yesterday's chunks
    // after an edit, which reads as "hot reload is broken" and wastes hours.
    expect(shouldRegisterServiceWorker("development", true)).toBe(false);
    expect(shouldRegisterServiceWorker("test", true)).toBe(false);
  });

  it("never registers where the API is missing", () => {
    // Private-mode Firefox and old iOS both drop navigator.serviceWorker.
    expect(shouldRegisterServiceWorker("production", false)).toBe(false);
  });
});
