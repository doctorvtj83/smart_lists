import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { RetryButton } from "./RetryButton";
import styles from "./page.module.css";

/**
 * The fallback the service worker serves when a navigation request fails.
 *
 * Why force-static: the service worker precaches this route's HTML during
 * install, which only works if the response is a fixed document. Any dynamic API
 * (cookies, headers, auth) would make Next render it per request and there would
 * be nothing to cache. It also means the page must NOT read the session — which
 * is fine, because "you are offline" is the same message for everyone.
 *
 * It is exempted from the auth middleware in src/middleware.ts for the same
 * reason: without that, install-time precaching would store a /login redirect.
 *
 * The copy follows the design's empty-state pattern (handoff § Empty States):
 * glyph, one German sentence, and the action immediately below it. This is not
 * an error screen, it is an invitation to try again.
 */
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className={styles.screen}>
      <EmptyState
        icon={<Icon icon={WifiOff} size={22} />}
        tone="neutral"
        title="Keine Verbindung"
        description="Smart Lists braucht Internet, um deine Listen zu laden. Sobald du wieder online bist, geht es weiter."
      >
        <RetryButton />
      </EmptyState>
    </main>
  );
}
