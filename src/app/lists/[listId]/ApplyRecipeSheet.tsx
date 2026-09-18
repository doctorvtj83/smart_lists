"use client";

import { useActionState, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { Sheet } from "@/components/ui/Sheet";
import { Stepper } from "@/components/ui/Stepper";
import { formatRecipeArticleCount } from "@/lib/format/plural";
import type { RecipeLabels } from "@/lib/recipes/labels";
import type { RecipeSummary } from "@/lib/recipes/recipes";
import { APPLY_FORM_IDLE, type ApplyFormState } from "./formState";
import styles from "./ApplyRecipeSheet.module.css";

type ApplyAction = (prev: ApplyFormState, formData: FormData) => Promise<ApplyFormState>;

type ApplyRecipeSheetProps = {
  recipes: RecipeSummary[];
  /** Composed by the page from the project — never re-derived here (spec §4). */
  labels: RecipeLabels;
  onClose: () => void;
  applyAction: ApplyAction;
  /** Test seam only: lets a test render a result state without a round-trip. */
  initialState?: ApplyFormState;
};

/**
 * The add-to-list sheet (`labels.addToList`; spec §6, "Into an existing list").
 *
 * Three states in one component, because they are three views of one decision:
 *  1. the PICKER — one stepper per recipe,
 *  2. the RESULT — the German sentence plus „Fertig“ (ruling R6: the sheet reports in place, since
 *     the ⋮ menu lives in a Server Component's header and a banner „on the screen“ would need a
 *     provider for one line of text),
 *  3. the FAILURE — the error plus „Erneut versuchen“, which simply submits the same form again.
 *
 * WHY THE RETRY IS JUST A SECOND SUBMIT: the apply token below is generated once and kept until an
 * apply succeeds, so re-submitting produces byte-identical operation ids; lines that already landed
 * replay as no-ops through Slice 17's ledger and the rest apply (spec §6, ruling R1). There is no
 * compensating delete and no transaction — the idempotency does the work.
 */
export function ApplyRecipeSheet({
  recipes,
  labels,
  onClose,
  applyAction,
  initialState = APPLY_FORM_IDLE,
}: ApplyRecipeSheetProps) {
  // One count per recipe, all starting at 0 = „not chosen“ (spec §6). A Record rather than an
  // array keeps the lookup by id, which is what the render and the hidden inputs both need.
  const [counts, setCounts] = useState<Record<string, number>>({});
  /**
   * The apply token: ONE per attempt, generated lazily so it is created in the browser and never
   * during a server render. It survives a failure on purpose — that is what makes „Erneut
   * versuchen" idempotent — and is regenerated after a success, because applying the same recipe a
   * second time is a new intent, not a replay.
   */
  const [token, setToken] = useState(() => crypto.randomUUID());

  const [state, formAction, pending] = useActionState(async (prev: ApplyFormState, formData: FormData) => {
    const next = await applyAction(prev, formData);
    // A fresh token for the next apply, so re-opening the picker after a success can add more.
    if (next.ok) setToken(crypto.randomUUID());
    return next;
  }, initialState);

  const chosen = recipes
    .map((recipe) => ({ recipe, count: counts[recipe.id] ?? 0 }))
    .filter((entry) => entry.count > 0);

  // The confirmation view. `state.message` is the composed sentence from formatApplyResult.
  if (state.ok && state.message) {
    return (
      <Sheet open onClose={onClose} title={labels.addToList}>
        <div className={styles.result}>
          <Banner tone="success">{state.message}</Banner>
          <Button type="button" fullWidth onClick={onClose}>
            Fertig
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={labels.addToList}>
      <form action={formAction} className={styles.form}>
        {/* The token travels with every attempt; the server derives each entry's id from it. */}
        <input type="hidden" name="applyToken" value={token} />

        <ul className={styles.rows}>
          {recipes.map((recipe) => (
            <li key={recipe.id} className={styles.row}>
              <span className={styles.name}>
                {recipe.name}
                <span className={styles.meta}>{formatRecipeArticleCount(recipe.itemCount)}</span>
              </span>
              <Stepper
                // „Anzahl Lasagne“ — the counted thing is named, so the two buttons' derived
                // labels are unambiguous when several steppers sit in one sheet.
                label={`Anzahl ${recipe.name}`}
                value={counts[recipe.id] ?? 0}
                onChange={(next) => setCounts((current) => ({ ...current, [recipe.id]: next }))}
              />
            </li>
          ))}
        </ul>

        {/* One field per CHOSEN recipe. „id:count“ rather than two parallel arrays: a UUID
            contains no colon, so the split is unambiguous, and a recipe with count 0 simply has
            no field — the server never has to interpret a zero. */}
        {chosen.map(({ recipe, count }) => (
          <input key={recipe.id} type="hidden" name="selection" value={`${recipe.id}:${count}`} />
        ))}

        {state.error ? <FieldError>{state.error}</FieldError> : null}

        <Button type="submit" fullWidth disabled={pending || chosen.length === 0}>
          {/* A failed attempt renames the button rather than adding a second one: it is the same
              form, the same token and the same intent. */}
          {state.error ? "Erneut versuchen" : "Hinzufügen"}
        </Button>
      </form>
    </Sheet>
  );
}
