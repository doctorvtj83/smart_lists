"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DrawerContext, type DrawerControls } from "./DrawerContext";
import { ProjectNavPanel, type NavProject } from "./ProjectNavPanel";
import styles from "./ProjectShell.module.css";

/** Everything the navigation renders, read once by the layout on the server. */
export interface ProjectNavPanelData {
  projectId: string;
  projectName: string;
  projects: NavProject[];
  activeListCount: number;
  memberCount: number;
  isAdmin: boolean;
}

type ProjectShellProps = {
  nav: ProjectNavPanelData;
  /** Server Action, forwarded to the panel's „Abmelden" form. */
  signOutAction: () => Promise<void>;
  /** The screen (a Server Component) rendered inside the shell. */
  children: ReactNode;
};

/**
 * The navigation shell wrapping every project screen: a permanent 250px sidebar
 * from 900px up, an overlay drawer below it (handoff § Navigation).
 *
 * Why the sidebar is always in the DOM and hidden with CSS rather than rendered
 * conditionally on a measured width: a JS-measured breakpoint cannot run during
 * the server render, so the first paint would either miss the sidebar or show a
 * drawer that instantly disappears. A media query has no such moment.
 *
 * Why the shell owns the drawer state instead of each screen: the drawer must
 * survive a navigation between screens... it does not, actually — a link click
 * closes it on purpose (see onNavigate). It lives here because the OVERLAY is a
 * sibling of the content, which only the layout can express.
 *
 * Escape handling and the body-scroll lock are duplicated from Sheet rather than
 * extracted: the drawer slides in from the left with its own animation and no
 * grabber or title bar, so sharing an implementation would mean a Sheet with two
 * mutually exclusive halves.
 */
export function ProjectShell({ nav, signOutAction, children }: ProjectShellProps) {
  const [isOpen, setIsOpen] = useState(false);

  // useCallback keeps the context value stable so consumers do not re-render on
  // every shell render (the value object is memoised below for the same reason).
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const controls = useMemo<DrawerControls>(
    () => ({ isOpen, open, close }),
    [isOpen, open, close],
  );

  useEffect(() => {
    // Nothing to wire up while closed — and the early return keeps the cleanup
    // from clearing an overflow lock a sheet on the screen might own.
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    // On document, not on the panel: Escape must work wherever focus sits.
    document.addEventListener("keydown", handleKeyDown);
    // Stops the screen behind the drawer scrolling under the user's thumb.
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <DrawerContext.Provider value={controls}>
      <div className={styles.shell}>
        {/* Desktop sidebar. No onNavigate: it is permanent, so there is nothing
            to close after a tap. */}
        <aside className={styles.sidebar}>
          <ProjectNavPanel {...nav} signOutAction={signOutAction} />
        </aside>

        {/* The screen. It is a column so a page's PageHeader can stay pinned
            while its <main> grows — the layout every screen already assumes. */}
        <div className={styles.content}>{children}</div>

        {isOpen && (
          <>
            {/* A plain div, not a button: it duplicates Escape and the nav links,
                so a nameless tab stop would only add noise (Sheet precedent). */}
            <div className={styles.overlay} data-testid="drawer-overlay" onClick={close} />
            <div className={styles.drawer} role="dialog" aria-modal="true" aria-label="Navigation">
              {/* onNavigate={close}: tapping an entry navigates, and a drawer
                  left open would cover the screen the user just asked for. */}
              <ProjectNavPanel {...nav} signOutAction={signOutAction} onNavigate={close} />
            </div>
          </>
        )}
      </div>
    </DrawerContext.Provider>
  );
}
