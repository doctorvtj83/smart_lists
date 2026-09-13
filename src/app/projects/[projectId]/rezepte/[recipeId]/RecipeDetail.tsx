"use client";

import { useActionState, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldError } from "@/components/ui/FieldError";
import { Icon } from "@/components/ui/Icon";
import { useCatalogSearch } from "@/components/ui/useCatalogSearch";
import { buildAutocomplete } from "@/lib/catalog/autocomplete";
import { formatQuantityLabel } from "@/lib/format/quantity";
import type { RecipeLabels } from "@/lib/recipes/labels";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "../formState";
import { RecipeItemSheet } from "./RecipeItemSheet";
import styles from "./RecipeDetail.module.css";

/**
 * One recipe line as this screen renders it — the article's name flattened onto the line, because
 * a RecipeItem has no name of its own (the name lives on the catalog article).
 *
 * Exported because RecipeItemSheet takes exactly this shape: the sheet edits a line, and inventing
 * a second near-identical type for it is how the two drift apart.
 */
export interface RecipeLine {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
}

type RecipeDetailProps = {
  projectId: string;
  recipeId: string;
  lines: RecipeLine[];
  labels: RecipeLabels;
  /** All three are Server Actions bound by the page; all three are member-level. */
  addLineAction: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  updateLineAction: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  removeLineAction: (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  initialState?: RecipeFormState;
};

/**
 * The recipe's lines plus the trailing „Artikel hinzufügen…" row (spec §5).
 *
 * REUSE IS THE POINT, and it is literal: the trailing row is the list screen's row minus the
 * category chips — the same `Autocomplete`, the same `/api/projects/[id]/catalog` endpoint through
 * `useCatalogSearch`, the same `buildAutocomplete`. The quantity split is NOT done here: the row
 * posts the raw text and `addRecipeItemFromRow` (Task 5) parses it server-side, which is what keeps
 * "500 g Hackfleisch" splitting identically on a list and in a recipe.
 *
 * What is deliberately absent compared with the list screen: category chips (a recipe line has no
 * category — it inherits the article's at apply time), checkboxes (nothing is "done" in a recipe),
 * swipe-to-delete (removal lives in the line sheet, where the line is already open) and the sync
 * poller (recipes are configuration and are not in the delta sync, spec §5).
 */
export function RecipeDetail({
  projectId,
  recipeId,
  lines,
  labels,
  addLineAction,
  updateLineAction,
  removeLineAction,
  initialState = RECIPE_FORM_IDLE,
}: RecipeDetailProps) {
  const [addState, addFormAction] = useActionState(addLineAction, initialState);
  const [draft, setDraft] = useState("");
  // Which line's sheet is open, by id — not the line object, so a revalidated render shows fresh
  // values in an open sheet instead of the snapshot that was captured when it opened.
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  // Keeps the cursor in the trailing row after a submit ("Enter legt an und bleibt im Feld").
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const articles = useCatalogSearch(projectId, draft);
  const { options, createName } = buildAutocomplete(articles, draft);

  const openLine = lines.find((line) => line.id === openLineId) ?? null;

  /**
   * Closes the sheet only after the edit action confirms success, so a failed save leaves the
   * offending fields and their inline error visible.
   */
  async function submitLineUpdate(
    previousState: RecipeFormState,
    formData: FormData,
  ): Promise<RecipeFormState> {
    const result = await updateLineAction(previousState, formData);
    if (result.ok) setOpenLineId(null);
    return result;
  }

  /**
   * Mirrors the update lifecycle for removal: successful deletion closes the sheet, while a
   * domain error stays in the mounted sheet where RecipeItemSheet can render it.
   */
  async function submitLineRemoval(
    previousState: RecipeFormState,
    formData: FormData,
  ): Promise<RecipeFormState> {
    const result = await removeLineAction(previousState, formData);
    if (result.ok) setOpenLineId(null);
    return result;
  }

  /** Submits the trailing row's text and clears it, leaving focus where it was. */
  const submitDraft = (name: string) => {
    const text = name.trim();
    if (!text) return;
    const formData = new FormData();
    formData.set("text", text);
    // requestSubmit would re-read the input, which we are about to clear — so the action is
    // invoked directly with the text that was actually typed.
    void addFormAction(formData);
    setDraft("");
    inputRef.current?.focus();
  };

  return (
    <div className={styles.screen}>
      {lines.length === 0 ? (
        <EmptyState
          // `icon` is REQUIRED by the primitive — there is no iconless variant.
          icon={<Icon icon={BookOpen} size={28} />}
          title={`Noch keine Artikel in diesem ${labels.singular}`}
          description="Tippe unten einen Artikel ein — „500 g Hackfleisch&quot; wird direkt in Menge und Einheit zerlegt."
        />
      ) : (
        <ul className={styles.lines}>
          {lines.map((line) => (
            <li key={line.id}>
              {/* A button, not a link: tapping a line opens a sheet on this screen. */}
              <button
                type="button"
                className={styles.line}
                data-line-id={line.id}
                onClick={() => setOpenLineId(line.id)}
              >
                <span className={styles.quantity}>
                  {/* "—" rather than "": an unquantified line (Salz) must still occupy the column,
                      or the names stop lining up down the list. */}
                  {formatQuantityLabel(line.quantity, line.unit) || "—"}
                </span>
                <span className={styles.name}>{line.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {addState.error ? <FieldError>{addState.error}</FieldError> : null}

      <form ref={formRef} action={addFormAction} className={styles.addRow}>
        <Autocomplete
          value={draft}
          onChange={setDraft}
          onSubmit={submitDraft}
          options={options}
          createName={createName}
          placeholder="Artikel hinzufügen…"
          inputLabel="Artikel hinzufügen"
          inputRef={inputRef}
        />
      </form>

      {openLine ? (
        <RecipeItemSheet
          // key={line.id} is the React idiom for "re-seed state from props on identity change" —
          // the same contract EntrySheet documents.
          key={openLine.id}
          line={openLine}
          recipeId={recipeId}
          onClose={() => setOpenLineId(null)}
          updateAction={submitLineUpdate}
          removeAction={submitLineRemoval}
        />
      ) : null}
    </div>
  );
}
