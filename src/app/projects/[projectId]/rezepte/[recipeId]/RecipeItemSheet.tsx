"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { formatGermanNumber } from "@/lib/format/date";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "../formState";
import type { RecipeLine } from "./RecipeDetail";
import styles from "./RecipeItemSheet.module.css";

type RecipeItemSheetProps = {
  /** The line being edited. The sheet is only rendered when there is one. */
  line: RecipeLine;
  recipeId: string;
  onClose: () => void;
  /** Server Actions, bound by the page. Both are member-level. */
  updateAction: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  removeAction: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  /** Test seam only: lets a test render a result state without a round-trip. */
  initialState?: RecipeFormState;
};

/**
 * The recipe line's detail sheet (spec §5: "the existing EntrySheet with the category field
 * removed").
 *
 * Why a separate component rather than a flag on EntrySheet (ruling R1): EntrySheet is typed
 * against `ListEntry`, emits `EntryChanges` including a category, and half its body is the category
 * chip row. A `showCategory` prop would leave one component with two mutually exclusive halves.
 * What IS shared is everything that makes them look and feel identical — `Sheet`, `TextField`,
 * `Button`, and the same German number round-trip.
 *
 * Why there is no category field at all: a recipe line has no category of its own. It inherits the
 * ARTICLE's at apply time (spec §2), so offering one here would store a value nothing ever reads.
 *
 * Why both fields are sent every time, unlike EntrySheet's careful field diff: that diff exists
 * because list entries are edited concurrently and merge per field (MVP design §4.5). A recipe is
 * configuration edited by one person at a time, with plain last-writer-wins (spec §5) — there is
 * nothing to preserve by sending less.
 */
export function RecipeItemSheet({
  line,
  recipeId,
  onClose,
  updateAction,
  removeAction,
  initialState = RECIPE_FORM_IDLE,
}: RecipeItemSheetProps) {
  const [state, saveFormAction, saving] = useActionState(updateAction, initialState);
  // Removal needs its own result state: discarding it would turn a rejected delete into a silent
  // no-op. It starts idle independently so the update test seam does not duplicate an error.
  const [removeState, removeFormAction, removing] = useActionState(
    removeAction,
    RECIPE_FORM_IDLE,
  );

  // Drafts are strings, because that is what a text input holds. Converting only on the server
  // keeps "1," mid-typing from being interpreted as a number.
  const [quantity, setQuantity] = useState(
    line.quantity === null ? "" : formatGermanNumber(line.quantity),
  );
  const [unit, setUnit] = useState(line.unit ?? "");

  // The article name is the title, exactly as on a list entry — it is what the user tapped.
  return (
    <Sheet open onClose={onClose} title={line.name}>
      <form action={saveFormAction} className={styles.form}>
        {/* Hidden rather than a prop on the action: a Server Action reached directly must still
            say WHICH line it edits, and the page's guard scopes it to this recipe. */}
        <input type="hidden" name="recipeItemId" value={line.id} />
        <input type="hidden" name="recipeId" value={recipeId} />

        {/* Only the two compact inputs form a row. Errors and actions remain full-width siblings. */}
        <div className={styles.fields}>
          <div className={styles.quantityField}>
            <TextField
              label="Menge"
              aria-label="Menge"
              name="quantity"
              placeholder="1,5"
              // Brings up the numeric keypad on iPhone; the comma still arrives as text.
              inputMode="decimal"
              fieldSize="sm"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <div className={styles.unitField}>
            <TextField
              label="Einheit"
              aria-label="Einheit"
              name="unit"
              placeholder="l"
              fieldSize="sm"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
            />
          </div>
        </div>

        {state.error ? <FieldError>{state.error}</FieldError> : null}

        <div className={styles.actions}>
          <Button type="submit" disabled={saving}>
            Fertig
          </Button>
        </div>
      </form>

      {/* Its own form: a second submit button inside the first would post the edit as well.
          No ConfirmSheet — removing one line from a recipe is trivially redone by typing it again,
          and the list screen's entry delete has no second confirm either (Slice 12 ruling). */}
      <form action={removeFormAction} className={styles.removeForm}>
        <input type="hidden" name="recipeItemId" value={line.id} />
        <Button type="submit" variant="danger" disabled={removing}>
          Entfernen
        </Button>
        {removeState.error ? <FieldError>{removeState.error}</FieldError> : null}
      </form>
    </Sheet>
  );
}
