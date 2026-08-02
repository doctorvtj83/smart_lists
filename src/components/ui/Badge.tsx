import type { ReactNode } from "react";
import styles from "./Badge.module.css";

/**
 * A small status pill. The design uses exactly one look for it — accent text on
 * accent tint — for both "OWNER" (project rows, member rows) and "ADMIN" (the
 * Verwaltung header), so the component takes no tone prop on purpose: a second
 * badge colour would be a design decision, not a code decision.
 */
export function Badge({ children }: { children: ReactNode }) {
  return <span className={styles.badge}>{children}</span>;
}
