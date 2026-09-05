import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Tests the REAL public/sw.js rather than a mirrored copy of its logic.
 *
 * Pattern: script-in-a-stub-scope. A service worker is a plain classic script
 * that talks to a `self` global, so wrapping the file's source in a Function
 * whose only parameter is `self` gives it a fake worker scope. Appending a
 * `return` statement hands the file's top-level bindings back to the test —
 * which is what lets us call the pure `pickStrategy` directly instead of
 * reverse-engineering it from fetch events.
 */

type FetchHandler = (event: {
  request: { url: string; method: string; mode: string };
  respondWith: (response: unknown) => void;
}) => void;

interface SwScope {
  addEventListener: (type: string, handler: unknown) => void;
  skipWaiting: () => void;
  clients: { claim: () => void };
}

function loadServiceWorker() {
  const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
  const listeners: Record<string, unknown> = {};
  const self: SwScope = {
    addEventListener: (type, handler) => {
      listeners[type] = handler;
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };

  const factory = new Function(
    "self",
    `${source}\nreturn { pickStrategy, CACHE_VERSION, PRECACHE_URLS };`,
  ) as (scope: SwScope) => {
    pickStrategy: (url: string, mode: string) => string;
    CACHE_VERSION: string;
    PRECACHE_URLS: string[];
  };

  return { ...factory(self), listeners, self };
}

describe("service worker", () => {
  it("precaches the offline page, the manifest and every icon", () => {
    const { PRECACHE_URLS } = loadServiceWorker();
    expect(PRECACHE_URLS).toEqual([
      "/offline",
      "/manifest.webmanifest",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/maskable-512.png",
      "/apple-touch-icon.png",
    ]);
  });

  it("registers the three lifecycle listeners", () => {
    const { listeners } = loadServiceWorker();
    expect(typeof listeners.install).toBe("function");
    expect(typeof listeners.activate).toBe("function");
    expect(typeof listeners.fetch).toBe("function");
  });

  it("serves the immutable Next chunks cache-first", () => {
    const { pickStrategy } = loadServiceWorker();
    // /_next/static/* filenames carry a content hash, so a cached copy can never
    // be stale — this is the only thing worth reading from cache first.
    expect(pickStrategy("https://x.test/_next/static/chunks/main.js", "no-cors")).toBe(
      "cache-first",
    );
  });

  it("keeps a cache-first fetch alive until the cache write finishes", async () => {
    const { listeners } = loadServiceWorker();
    const request = {
      url: "https://x.test/_next/static/chunks/main.js",
      method: "GET",
      mode: "no-cors",
    };
    const cachedCopy = { body: "cached copy" };
    const networkResponse = {
      body: "network response",
      // This test exercises the successful-response cache path; the explicit
      // flag keeps the stub faithful now that the worker rejects non-OK writes.
      ok: true,
      clone: vi.fn(() => cachedCopy),
    };

    // A manually controlled Promise makes the cache write remain pending long
    // enough to prove that respondWith is bound to its lifetime.
    let finishCacheWrite!: () => void;
    const pendingCacheWrite = new Promise<void>((resolveWrite) => {
      finishCacheWrite = resolveWrite;
    });
    const put = vi.fn(() => pendingCacheWrite);
    vi.stubGlobal("caches", {
      match: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockResolvedValue({ put }),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(networkResponse));

    let responded: unknown;
    const handler = listeners.fetch as FetchHandler;
    handler({
      request,
      respondWith: (response) => {
        responded = response;
      },
    });

    let responseSettled = false;
    Promise.resolve(responded).then(() => {
      responseSettled = true;
    });

    // Wait until the worker has started cache.put before checking whether the
    // response incorrectly settled while that write is still pending.
    await vi.waitFor(() => expect(put).toHaveBeenCalled());
    await Promise.resolve();
    expect(responseSettled).toBe(false);

    finishCacheWrite();
    await expect(responded).resolves.toBe(networkResponse);
    vi.unstubAllGlobals();
  });

  it("does not persist a non-OK cache-first response", async () => {
    const { listeners } = loadServiceWorker();
    const request = {
      url: "https://x.test/_next/static/chunks/main.js",
      method: "GET",
      mode: "no-cors",
    };
    // A real Response pins the platform's `ok` semantics: deploy-time 404/502
    // responses must reach the page without becoming permanent cache entries.
    const networkResponse = new Response("Bad Gateway", { status: 502 });
    const put = vi.fn();
    vi.stubGlobal("caches", {
      match: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockResolvedValue({ put }),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(networkResponse));

    let responded: unknown;
    const handler = listeners.fetch as FetchHandler;
    handler({
      request,
      // Capture respondWith's Promise so the test observes the real worker path
      // through fetch rather than duplicating its cache decision.
      respondWith: (response) => {
        responded = response;
      },
    });

    await expect(responded).resolves.toBe(networkResponse);
    expect(put).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("falls back to the offline page only for navigations", () => {
    const { pickStrategy } = loadServiceWorker();
    expect(pickStrategy("https://x.test/projects", "navigate")).toBe("network-then-offline");
    expect(pickStrategy("https://x.test/projects", "cors")).toBe("network-only");
  });

  it("never intercepts the API — sync and auth must always hit the network", () => {
    const { pickStrategy } = loadServiceWorker();
    // Caching a delta poll or an auth callback would hand the user stale list
    // state that looks live. True offline is Phase 2 and needs the operation
    // queue from the MVP design, not an opportunistic cache.
    expect(pickStrategy("https://x.test/api/lists/abc/delta", "cors")).toBe("network-only");
    expect(pickStrategy("https://x.test/api/auth/session", "navigate")).toBe("network-only");
  });

  it("answers a failed navigation with the cached offline page", async () => {
    const { listeners } = loadServiceWorker();
    const offlineResponse = { body: "offline" };
    // The worker reaches for caches.match("/offline") after fetch() rejects.
    vi.stubGlobal("caches", { match: vi.fn().mockResolvedValue(offlineResponse) });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    let responded: unknown;
    const handler = listeners.fetch as FetchHandler;
    handler({
      request: { url: "https://x.test/projects", method: "GET", mode: "navigate" },
      respondWith: (response) => {
        responded = response;
      },
    });

    await expect(responded).resolves.toBe(offlineResponse);
    vi.unstubAllGlobals();
  });
});
