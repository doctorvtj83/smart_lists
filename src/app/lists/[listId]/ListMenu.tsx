"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { Icon } from "@/components/ui/Icon";
import type { DerivableEntry } from "@/lib/recipes/build";
import type { RecipeLabels } from "@/lib/recipes/labels";
import type { RecipeSummary } from "@/lib/recipes/recipes";
import { ApplyRecipeSheet } from "./ApplyRecipeSheet";
import { DeriveRecipeSheet } from "./DeriveRecipeSheet";
import type { ApplyFormState, DeriveFormState } from "./formState";
import styles from "./ListMenu.module.css";

type ListMenuProps = {
  /** Named in the confirmation so the user sees WHICH list is at stake. */
  listName: string;
  /** A completed list has nothing to complete; it reopens from the green banner. */
  isCompleted: boolean;
  /** Server Actions, bound by the page. Both are member-level. */
  completeAction: () => void | Promise<void>;
  deleteAction: () => void | Promise<void>;
  /**
   * Present only when the project has recipes ON and at least one recipe exists (ruling R8) —
   * a picker with nothing to pick is a dead end. `undefined` means „no entry at all“.
   */
  recipeApply?: {
    labels: RecipeLabels;
    recipes: RecipeSummary[];
    applyAction: (prev: ApplyFormState, formData: FormData) => Promise<ApplyFormState>;
  };
  /**
   * Present only when the project has recipes ON (ruling R8). Unlike `recipeApply` there is no
   * „at least one recipe“ condition — deriving is how the FIRST recipe gets created.
   */
  recipeDerive?: {
    labels: RecipeLabels;
    entries: DerivableEntry[];
    units: string[];
    createAction: (prev: DeriveFormState, formData: FormData) => Promise<DeriveFormState>;
  };
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
export function ListMenu({
  listName,
  isCompleted,
  completeAction,
  deleteAction,
  recipeApply,
  recipeDerive,
}: ListMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [deriveOpen, setDeriveOpen] = useState(false);

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
            {/* Applying is a change to the list's contents, so it is hidden on a completed list
                exactly as „Liste abschließen“ is (ruling R8). An empty recipe list is also a
                dead end — the page already omits `recipeApply`, but the menu itself refuses a
                picker with nothing to pick. */}
            {recipeApply && recipeApply.recipes.length > 0 && !isCompleted && (
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  // Close the menu first: the sheet is the surface the user should now be
                  // looking at, and two overlays would fight (the ConfirmSheet precedent).
                  setOpen(false);
                  setApplyOpen(true);
                }}
              >
                {recipeApply.labels.addToList}
              </button>
            )}
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
            {/* Only on a COMPLETED list: an open list is still being shopped, so its quantities
                are not settled (spec §7). */}
            {recipeDerive && isCompleted && (
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  setOpen(false);
                  setDeriveOpen(true);
                }}
              >
                {recipeDerive.labels.fromList}
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

      {recipeApply && applyOpen && (
        <ApplyRecipeSheet
          recipes={recipeApply.recipes}
          labels={recipeApply.labels}
          applyAction={recipeApply.applyAction}
          onClose={() => setApplyOpen(false)}
        />
      )}

      {recipeDerive && deriveOpen && (
        <DeriveRecipeSheet
          entries={recipeDerive.entries}
          labels={recipeDerive.labels}
          units={recipeDerive.units}
          createAction={recipeDerive.createAction}
          onClose={() => setDeriveOpen(false)}
        />
      )}
    </>
  );
}
