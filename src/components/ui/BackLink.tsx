import Link from "next/link";
import styles from "./BackLink.module.css";

type BackLinkProps = {
  /** Where "back" goes. An explicit destination, never history.back(). */
  href: string;
  /** The accessible name, e.g. "Zur Startseite". German, like all user-facing strings. */
  label: string;
};

/**
 * The back arrow for screens that sit outside the project drawer.
 *
 * Why it exists: the design routes almost all navigation through the drawer
 * (handoff §Navigation), but the drawer only renders inside a project. /admin and
 * /projects therefore had no way back to Home at all — reachable, but not
 * leavable. Rather than give those screens a drawer they do not fit, they get the
 * same "← Zurück" affordance the Zugang-verweigert screen already established.
 *
 * An explicit href rather than router.back(): the same screen can be reached from
 * several places, and a Server Component cannot read history anyway. This also
 * keeps the component free of client state — no "use client" needed.
 *
 * The arrow is aria-hidden and the name comes from aria-label, so a screen reader
 * announces "Zur Startseite" instead of "left arrow".
 */
export function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link href={href} aria-label={label} className={styles.back}>
      <span aria-hidden="true">←</span>
    </Link>
  );
}
