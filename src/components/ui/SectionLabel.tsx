import type { ReactNode } from "react";
import styles from "./SectionLabel.module.css";

/**
 * The small uppercase caption that opens a block ("WEITERMACHEN", "PROJEKTE",
 * "ZUGANG", "AKTIVE LISTEN").
 *
 * Why an <h2> and not a <div>: the design uses these as the only visible
 * structure on several screens, so they are the screen's real headings. Marking
 * them up as headings gives screen-reader users the same outline sighted users
 * get. `text-transform` (not uppercase literals) keeps the German text readable
 * to assistive tech.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className={styles.label}>{children}</h2>;
}
