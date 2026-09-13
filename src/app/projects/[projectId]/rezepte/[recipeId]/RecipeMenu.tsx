"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { Icon } from "@/components/ui/Icon";
import type { RecipeLabels } from "@/lib/recipes/labels";
import styles from "./RecipeMenu.module.css";

type RecipeMenuProps = {
  /** Named in the confirmation so the user sees WHICH recipe is at stake. */
  recipeName: string;
  /** The project's own wording — for example „Set löschen", never the default noun (spec §4). */
  labels: RecipeLabels;
  /** Server Action, bound by the page. Member-level. */
  deleteAction: () => void | Promise<void>;
};

/**
 * The recipe header's ⋮ menu (spec §5): only the destructive delete action.
 *
 * Why a hand-rolled menu instead of a Sheet: the design draws a small dropdown
 * anchored under the ⋮, not a bottom sheet — the sheet is reserved for decisions
 * with consequences, which is exactly why DELETING still opens one.
 *
 * The backdrop is a plain div rather than a button: it duplicates the trigger and
 * Escape, so putting a nameless stop in the tab order would only cost keyboard
 * users a step (the same reasoning as `Sheet`'s overlay).
 */
export function RecipeMenu({ recipeName, labels, deleteAction }: RecipeMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={`${labels.singular}menü`}
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
              {labels.deleteOne}
            </button>
          </div>
        </>
      )}

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`${labels.deleteOne}: ${recipeName}`}
        options={[
          {
            label: `${labels.singular} endgültig löschen`,
            // Deleting a recipe is deliberately unguarded (spec §5) — nothing references it, and a
            // list it was applied to keeps its entries. Say so, so the confirm is not scarier than
            // the act: the ONLY thing lost is the recipe itself.
            description:
              "Bereits angelegte Listen bleiben unverändert. Das lässt sich nicht rückgängig machen.",
            tone: "danger",
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
