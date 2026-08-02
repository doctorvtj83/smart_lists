import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

type PageHeaderProps = {
  /** The screen title — also the page's single <h1>. German, e.g. "Verwaltung". */
  title: string;
  /**
   * Slot before the title. Slice 14 leaves it empty; Slice 11 puts the ☰ drawer
   * trigger here, which is why the slot exists before there is anything to put in it.
   */
  leading?: ReactNode;
  /** Slot after the title, e.g. the ADMIN <Badge> on Verwaltung. */
  trailing?: ReactNode;
  /**
   * The 1px bottom rule. Screens with a hairline: Projekte, Verwaltung, Archiv.
   * Home has none (handoff screen 3c), so it opts out.
   */
  hairline?: boolean;
};

/**
 * The screen header bar shared by every top-level screen.
 *
 * Why a primitive: the design repeats exactly one header shape across screens,
 * and each screen needs the same safe-area padding, the same truncation rule and
 * the same single <h1>. Centralising it means Slice 11 adds the drawer trigger
 * in one place instead of five.
 *
 * Deliberately NOT a client component: it holds no state, so it renders inside
 * the Server Components that make up every screen in this slice.
 */
export function PageHeader({ title, leading, trailing, hairline = true }: PageHeaderProps) {
  // filter(Boolean) drops the empty slot so the class attribute stays clean
  // (same idiom as Button).
  const classes = [styles.header, hairline ? styles.hairline : ""].filter(Boolean).join(" ");

  return (
    // <header> gives the banner landmark for free — no explicit role needed.
    <header className={classes}>
      {leading}
      <h1 className={styles.title}>{title}</h1>
      {trailing}
    </header>
  );
}
