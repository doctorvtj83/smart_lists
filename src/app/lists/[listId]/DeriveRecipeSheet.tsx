"use client";

import { useActionState, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { formatGermanNumber } from "@/lib/format/date";
import { formatQuantityLabel } from "@/lib/format/quantity";
import { formatRecipeArticleCount } from "@/lib/format/plural";
import type { RecipeLabels } from "@/lib/recipes/labels";
import type { DerivableEntry } from "@/lib/recipes/build";
import { DERIVE_FORM_IDLE, type DeriveFormState } from "./formState";
import styles from "./DeriveRecipeSheet.module.css";

type DeriveAction = (prev: DeriveFormState, formData: FormData) => Promise<DeriveFormState>;

type DeriveRecipeSheetProps = {
  /** Every entry of the completed list, checked and unchecked alike (spec §7). */
  entries: DerivableEntry[];
  labels: RecipeLabels;
  /** The project's unit vocabulary, offered as a datalist on the unit fields. */
  units: string[];
  onClose: () => void;
  createAction: DeriveAction;
  /** Test seam only: lets a test render a result state without a round-trip. */
  initialState?: DeriveFormState;
};

/**
 * „Rezept aus Liste anlegen“ — the three-step flow of spec §7.
 *
 *  ① pick the rows that belong to this dish,
 *  ② name it and set the amounts for ONE unit,
 *  ③ confirm, and offer to build another from the same list.
 *
 * WHY EVERYTHING IS ONE SHEET AND ONE FORM: the three steps are one decision, and the amounts in
 * step ② are meaningless without the selection from step ①. Unmounting step ① would also drop its
 * checkboxes out of the submitted FormData, which is why the steps are HIDDEN rather than removed.
 *
 * WHY „consumed“ IS LOCAL STATE: an article may legitimately belong to two recipes (Zwiebeln in
 * the Lasagne and in the Chili), so this is a hint, not a rule — the rows are greyed and stay
 * selectable, and closing the sheet forgets everything (spec §7). That is exactly why it needs no
 * column and no server round-trip.
 *
 * WHY NOTHING IS PRE-SELECTED: a shopping list is mostly not one dish.
 */
export function DeriveRecipeSheet({
  entries,
  labels,
  units,
  onClose,
  createAction,
  initialState = DERIVE_FORM_IDLE,
}: DeriveRecipeSheetProps) {
  /**
   * Which of the three panes is showing.
   *
   * A phase, not a step NUMBER, because the third pane is not reachable by counting: it is entered
   * by the server confirming a create and left by the user choosing to loop. Deriving it from
   * `state.ok` alone would strand the sheet on the confirmation forever, since a resolved action
   * state never goes back to „not ok".
   *
   * The initial phase follows a restored state: an error belongs on „edit", next to the name and
   * the amounts that caused it; a success belongs on „done".
   */
  const [phase, setPhase] = useState<"select" | "edit" | "done">(
    initialState.ok ? "done" : initialState.error !== null ? "edit" : "select",
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Entry ids already used by a recipe built in THIS sheet session. Greyed, still selectable.
  const [consumed, setConsumed] = useState<Set<string>>(new Set());

  /**
   * Wrapping the passed Server Action advances the phase inside the submitting interaction rather
   * than synchronously setting state from an Effect — the pattern RecipeIndex established, and the
   * one React's lint rules accept. A rejected create leaves the editor and its values in place.
   */
  const [state, formAction, pending] = useActionState(
    async (prev: DeriveFormState, formData: FormData) => {
      const next = await createAction(prev, formData);
      if (next.ok) setPhase("done");
      return next;
    },
    initialState,
  );

  const chosen = entries.filter((entry) => selected.has(entry.id));

  const toggle = (id: string) => {
    setSelected((current) => {
      // A new Set on every change: mutating state in place would not re-render.
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** The loop (step ③): remember what this pass used, then start over with a clean selection. */
  const startAnother = () => {
    setConsumed((current) => new Set([...current, ...selected]));
    setSelected(new Set());
    setPhase("select");
  };

  // STEP ③ — the confirmation, which is also the loop.
  if (phase === "done" && state.createdName) {
    return (
      <Sheet open onClose={onClose} title={labels.fromList}>
        <div className={styles.result}>
          <Banner tone="success">
            {`„${state.createdName}“ angelegt · ${formatRecipeArticleCount(state.lineCount)}`}
          </Banner>
          <p className={styles.again}>{`Noch ein ${labels.singular} aus dieser Liste?`}</p>
          <div className={styles.buttons}>
            <Button type="button" variant="text" onClick={onClose}>
              Fertig
            </Button>
            <Button type="button" onClick={startAnother}>
              {`Weiteres ${labels.singular}`}
            </Button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={labels.fromList}>
      <form action={formAction} className={styles.form}>
        {/* STEP ① — the selection. Hidden, not unmounted: these checkboxes ARE the payload. */}
        <div hidden={phase === "edit"}>
          <ul className={styles.rows}>
            {entries.map((entry) => {
              // „500 g Hackfleisch“, or just „Salz“ when the row carries no amount.
              const amount = formatQuantityLabel(entry.quantity, entry.unit);
              const label = amount ? `${amount} ${entry.name}` : entry.name;
              return (
                <li key={entry.id} className={styles.row}>
                  <label
                    className={styles.rowLabel}
                    // A data attribute rather than a second class: the CSS Module styles the
                    // greyed state from one selector, and the test asserts roles and text only.
                    data-consumed={consumed.has(entry.id) ? "true" : "false"}
                  >
                    <input
                      type="checkbox"
                      name="entryId"
                      value={entry.id}
                      checked={selected.has(entry.id)}
                      onChange={() => toggle(entry.id)}
                    />
                    {label}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className={styles.buttons}>
            <Button type="button" variant="text" onClick={onClose}>
              Abbrechen
            </Button>
            {/* type="button": step ① must advance, never submit. */}
            <Button type="button" disabled={selected.size === 0} onClick={() => setPhase("edit")}>
              Weiter
            </Button>
          </div>
        </div>

        {/* STEP ② — name and per-unit amounts. Only the CHOSEN rows render fields, so a
            deselected row cannot leave a stray quantity behind in the FormData. */}
        {phase === "edit" && (
          <div className={styles.editor}>
            <TextField label="Name" aria-label="Name" name="name" placeholder={labels.singular} autoFocus />

            <ul className={styles.lines}>
              {chosen.map((entry) => (
                <li key={entry.id} className={styles.line}>
                  <span className={styles.lineName}>{entry.name}</span>
                  <div className={styles.lineFields}>
                    <TextField
                      // Keyed field names (ruling R10): three parallel getAll() arrays that only
                      // line up because of DOM order break silently the first time a row is
                      // conditionally rendered.
                      name={`quantity:${entry.id}`}
                      aria-label={`Menge ${entry.name}`}
                      fieldSize="sm"
                      inputMode="decimal"
                      // German comma in, German comma out — parseGermanDecimal reads it back.
                      // An empty field is a real value: it stores null („just add it“, D4).
                      defaultValue={entry.quantity === null ? "" : formatGermanNumber(entry.quantity)}
                    />
                    <TextField
                      name={`unit:${entry.id}`}
                      aria-label={`Einheit ${entry.name}`}
                      fieldSize="sm"
                      list="derive-units"
                      defaultValue={entry.unit ?? ""}
                    />
                  </div>
                </li>
              ))}
            </ul>

            {/* The project's own unit vocabulary, the same list the entry sheet offers. */}
            <datalist id="derive-units">
              {units.map((unit) => (
                <option key={unit} value={unit} />
              ))}
            </datalist>

            {state.error ? <FieldError>{state.error}</FieldError> : null}

            <div className={styles.buttons}>
              <Button type="button" variant="text" onClick={() => setPhase("select")}>
                Zurück
              </Button>
              <Button type="submit" disabled={pending}>
                {`${labels.singular} anlegen`}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Sheet>
  );
}
