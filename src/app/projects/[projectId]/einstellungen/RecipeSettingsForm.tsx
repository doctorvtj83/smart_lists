"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { TextField } from "@/components/ui/TextField";
import { Toggle } from "@/components/ui/Toggle";
import { recipeLabels } from "@/lib/recipes/labels";
import { SETTINGS_FORM_IDLE, type SettingsFormState } from "./formState";
import styles from "./RecipeSettingsForm.module.css";

type RecipeSettingsFormProps = {
  recipesEnabled: boolean;
  recipeLabelSingular: string;
  recipeLabelPlural: string;
  /** Server Action, bound by the page. Owner-only — the page re-checks. */
  saveAction: (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;
  /** Test seam only: lets a test render a result state without a round-trip. */
  initialState?: SettingsFormState;
};

/**
 * The recipes section of the project settings screen (spec §4): the opt-in switch and the two
 * label fields that name the feature.
 *
 * Why the toggle is a CLIENT state rather than a plain checkbox posted with the form: the switch's
 * accessible name is composed from the label the user is editing right now („Sets aktivieren"), so
 * the two controls have to see each other. The value still reaches the server as a hidden input, so
 * the form works as one submission.
 *
 * Why the label fields are never disabled while the switch is off: the wording is kept when the
 * feature is switched off (spec §2), and a project may well want to set its wording first. The
 * columns are independent precisely so this works.
 */
export function RecipeSettingsForm({
  recipesEnabled,
  recipeLabelSingular,
  recipeLabelPlural,
  saveAction,
  initialState = SETTINGS_FORM_IDLE,
}: RecipeSettingsFormProps) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);

  // Drafts, so the switch's accessible name updates as the user renames the feature. Seeded from
  // the server values once — the page re-renders with fresh props after revalidatePath.
  const [enabled, setEnabled] = useState(recipesEnabled);
  const [singular, setSingular] = useState(recipeLabelSingular);
  const [plural, setPlural] = useState(recipeLabelPlural);

  // The live wording, so every string on this screen already obeys the no-hardcoded-default rule
  // while the user is still typing the new name.
  const labels = recipeLabels({ recipeLabelSingular: singular, recipeLabelPlural: plural });

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.switchRow}>
        <div className={styles.switchText}>
          <span className={styles.switchLabel}>{labels.plural}</span>
          <span className={styles.switchHint}>
            Sets aus Artikeln, die du mit einer Anzahl auf eine Liste legen kannst.
          </span>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} label={`${labels.plural} aktivieren`} />
      </div>
      {/* The switch is client state; this is what actually travels with the form. */}
      <input type="hidden" name="recipesEnabled" value={enabled ? "on" : "off"} />

      <div className={styles.labelFields}>
        <TextField
          label="Einzahl"
          aria-label="Einzahl"
          name="recipeLabelSingular"
          fieldSize="sm"
          value={singular}
          onChange={(event) => setSingular(event.target.value)}
        />
        <TextField
          label="Mehrzahl"
          aria-label="Mehrzahl"
          name="recipeLabelPlural"
          fieldSize="sm"
          value={plural}
          onChange={(event) => setPlural(event.target.value)}
        />
      </div>

      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {/* role="status" (polite) rather than an alert: a save confirmation must not interrupt. */}
      {state.ok ? (
        <p role="status" className={styles.saved}>
          Gespeichert
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        Speichern
      </Button>
    </form>
  );
}
