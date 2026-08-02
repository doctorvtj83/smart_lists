"use client";

import { createContext, useContext } from "react";

/** What a consumer may do with the drawer. */
export interface DrawerControls {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/**
 * The drawer's open/closed state, published by ProjectShell.
 *
 * Why a context rather than props: the ☰ button lives inside each SCREEN's
 * PageHeader, while the drawer itself belongs to the layout that wraps those
 * screens. There is no prop path between them — a layout passes `children`, it
 * cannot reach into them. A context is the one mechanism that crosses that gap,
 * and it works across the server/client boundary because the pages are rendered
 * INSIDE the client provider's subtree.
 *
 * Default `null` (not a no-op object) so `useDrawer` can tell "no provider" from
 * "provider with a closed drawer".
 */
export const DrawerContext = createContext<DrawerControls | null>(null);

/**
 * Reads the drawer controls, failing loudly outside the shell.
 *
 * A missing provider means a screen was mounted outside the project layout — a
 * wiring mistake. Throwing surfaces it during development instead of shipping a
 * ☰ button that silently does nothing.
 */
export function useDrawer(): DrawerControls {
  const controls = useContext(DrawerContext);
  if (!controls) {
    throw new Error("useDrawer must be used inside a DrawerContext provider (ProjectShell).");
  }
  return controls;
}
