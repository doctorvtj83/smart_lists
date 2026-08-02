"use client";

import { useEffect, useId, type ReactNode } from "react";
import styles from "./Sheet.module.css";

type SheetProps = {
  open: boolean;
  /** Called on Escape, on an overlay click, and by the sheet's own controls. */
  onClose: () => void;
  /** German sheet title, e.g. "Neue Liste" or "Zugang entziehen: anna@web.de". */
  title: string;
  children: ReactNode;
};

/**
 * The bottom sheet — the design's answer to every modal decision (entry detail,
 * new list with pre-fill preview, the two-way revoke confirmation).
 *
 * Why a client component: it owns keyboard handling and a body-scroll lock,
 * both of which need effects.
 *
 * Why no focus trap: the MVP keeps this deliberately small. Escape closes,
 * the overlay closes, and the panel is a labelled aria-modal dialog, which is
 * what a screen reader needs to announce it. A full trap (and focus restore) is
 * worth adding the day a sheet grows a multi-step flow — note it, don't build it
 * speculatively.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const titleId = useId();

  useEffect(() => {
    // Nothing to wire up while closed — and the early return keeps the cleanup
    // from clearing an overflow lock that another sheet might own.
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    // Listening on document (not on the panel) is what makes Escape work no
    // matter where focus currently sits.
    document.addEventListener("keydown", handleKeyDown);
    // Stops the page behind the sheet from scrolling under the user's thumb.
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
    // onClose is in the deps because the handler closes over it. A caller passing
    // an inline arrow makes this effect re-run on every parent render — that is
    // harmless here (it tears down and immediately re-applies the same listener
    // and the same lock), so do not "fix" it by dropping the dependency.
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* The overlay is a plain div, not a button: it is a fallback gesture that
          duplicates Escape and the sheet's own cancel control, so putting it in
          the tab order would only add a nameless stop. */}
      <div className={styles.overlay} data-testid="sheet-overlay" onClick={onClose} />
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.grabber} aria-hidden="true" />
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children}
      </div>
    </>
  );
}
