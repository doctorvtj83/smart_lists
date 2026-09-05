"use client";

import { Button } from "@/components/ui/Button";

/**
 * The offline screen's only interactive element.
 *
 * It is its own client component so the page around it stays a Server Component
 * and can be statically prerendered — the service worker precaches that HTML at
 * install time, and a page that needed a server render could not be precached.
 *
 * location.reload() rather than a router refresh: when the network comes back we
 * want a full, cache-revalidating navigation, not a React tree update against a
 * router that is still holding the offline route.
 */
export function RetryButton() {
  return (
    <Button variant="primary" fullWidth onClick={() => window.location.reload()}>
      Erneut versuchen
    </Button>
  );
}
