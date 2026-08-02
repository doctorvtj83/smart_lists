"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { Icon } from "@/components/ui/Icon";
import styles from "./ListMenu.module.css";

type ListMenuProps = {
  /** Named in the confirmation so the user sees WHICH list is at stake. */
  listName: string;
  /** A completed list has nothing to complete; it reopens from the green banner. */
  isCompleted: boolean;
  /** Server Actions, bound by the page. Both are member-level. */
  completeAction: () => void | Promise<void>;
  deleteAction: () => void | Promise<void>;
};

/**
 * The list header's ⋮ menu (handoff §10): Liste abschließen / Liste löschen.
 *
 * Why a hand-rolled menu instead of a Sheet: the design draws a small dropdown
 * anchored under the ⋮, not a bottom sheet — the sheet is reserved for decisions
 * with consequences, which is exactly why DELETING still opens one.
 *
 * The backdrop is a plain div rather than a button: it duplicates the trigger and
 * Escape, so putting a nameless stop in the tab order would only cost keyboard
 * users a step (the same reasoning as `Sheet`'s overlay).
 */
export function ListMenu({ listName, isCompleted, completeAction, deleteAction }: ListMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Listenmenü"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon icon={MoreVertical} size={19} />
      </button>

      {open && (
        <>
          <div
            className={styles.backdrop}
            data-testid="menu-backdrop"
            onClick={() => setOpen(false)}
          />
          <div className={styles.menu} role="menu">
            {!isCompleted && (
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  void completeAction();
                  setOpen(false);
                }}
              >
                Liste abschließen
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className={[styles.item, styles.danger].join(" ")}
              onClick={() => {
                // Close the menu first: the confirmation sheet is the surface the
                // user should now be looking at, and two overlays would fight.
                setOpen(false);
                setConfirmOpen(true);
              }}
            >
              Liste löschen
            </button>
          </div>
        </>
      )}

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Liste löschen: ${listName}`}
        options={[
          {
            label: "Liste endgültig löschen",
            description:
              "Alle Einträge dieser Liste verschwinden mit. Das lässt sich nicht rückgängig machen.",
            tone: "danger",
            // ConfirmSheet does not close itself: fire, then drop the sheet.
            onSelect: () => {
              void deleteAction();
              setConfirmOpen(false);
            },
          },
        ]}
      />
    </>
  );
}
