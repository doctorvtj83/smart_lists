"use client";

import { useActionState, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldError } from "@/components/ui/FieldError";
import { Icon } from "@/components/ui/Icon";
import { RowLink } from "@/components/ui/RowLink";
import { TextField } from "@/components/ui/TextField";
import { formatRecipeArticleCount } from "@/lib/format/plural";
import type { RecipeLabels } from "@/lib/recipes/labels";
import type { RecipeSummary } from "@/lib/recipes/recipes";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "./formState";
import styles from "./RecipeIndex.module.css";

type RecipeIndexProps = {
  projectId: string;
  recipes: RecipeSummary[];
  /** Composed by the page from the project — never re-derived here (spec §4). */
  labels: RecipeLabels;
  createAction: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  /** Test seam only: lets a test render a result state without a round-trip. */
  initialState?: RecipeFormState;
};

/**
 * The recipe index (spec §5): one row per recipe, plus the create control.
 *
 * Why the create control is a button that REVEALS a field rather than a permanently visible form:
 * the screen's job is browsing, and a name field sitting above the list every time you open it is
 * the kind of clutter the design's empty-state-first approach avoids. The same shape the Katalog
 * screen uses for „Neuen Artikel anlegen…".
 *
 * Client component only because of that open/closed state and useActionState — the DATA is
 * server-owned and arrives as props, so a rename elsewhere shows up through revalidation.
 */
export function RecipeIndex({
  projectId,
  recipes,
  labels,
  createAction,
  initialState = RECIPE_FORM_IDLE,
}: RecipeIndexProps) {
  // A state restored after a failed Server Action must reopen the form; otherwise its inline error
  // would exist in state but remain hidden behind the create button.
  const [creating, setCreating] = useState(initialState.error !== null);

  /**
   * Closes the field only after the server confirms success.
   *
   * Wrapping the passed Server Action keeps this transition in the submitting interaction instead
   * of synchronously setting local state from an Effect, which React's lint rules reject because it
   * creates an avoidable cascading render. A rejected name leaves the form and its text in place.
   */
  async function submitCreate(
    previousState: RecipeFormState,
    formData: FormData,
  ): Promise<RecipeFormState> {
    const result = await createAction(previousState, formData);
    if (result.ok) setCreating(false);
    return result;
  }

  const [state, formAction, pending] = useActionState(submitCreate, initialState);

  return (
    <div className={styles.screen}>
      {recipes.length === 0 && !creating ? (
        <EmptyState
          icon={<Icon icon={BookOpen} size={28} />}
          title={`Noch keine ${labels.plural}`}
          description={`Lege ${labels.plural} aus Artikeln an, die du später mit einer Anzahl auf eine Liste legst.`}
        />
      ) : (
        <ul className={styles.rows}>
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <RowLink
                href={`/projects/${projectId}/rezepte/${recipe.id}`}
                title={recipe.name}
                meta={formatRecipeArticleCount(recipe.itemCount)}
              />
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <form action={formAction} className={styles.createForm}>
          <TextField
            label="Name"
            aria-label="Name"
            name="name"
            fieldSize="sm"
            placeholder={labels.singular}
            autoFocus
          />
          {state.error ? <FieldError>{state.error}</FieldError> : null}
          <div className={styles.createButtons}>
            <Button type="submit" disabled={pending}>
              Anlegen
            </Button>
            {/* "text" is this project's lightest button weight; there is no "ghost" variant. */}
            <Button type="button" variant="text" onClick={() => setCreating(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" onClick={() => setCreating(true)}>
          {/* Button takes no icon slot — it spreads native button props and renders children, so
              the glyph simply goes inside. labels.newOne supports defaults and e.g. „Neues Set":
              composed, never hardcoded (spec §4). */}
          <Icon icon={Plus} size={16} />
          {labels.newOne}
        </Button>
      )}
    </div>
  );
}
