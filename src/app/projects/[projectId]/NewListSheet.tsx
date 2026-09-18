"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { Stepper } from "@/components/ui/Stepper";
import { TextField } from "@/components/ui/TextField";
import { Toggle } from "@/components/ui/Toggle";
import type { SuggestedArticle } from "@/lib/suggestions/suggestions";
import {
  formatNewListLabel,
  formatNewListWithRecipesLabel,
  formatRecipeOverlapNote,
} from "@/lib/format/plural";
import type { RecipeLabels } from "@/lib/recipes/labels";
import type { RecipeForPicker } from "@/lib/recipes/recipes";
import styles from "./NewListSheet.module.css";

type NewListSheetProps = {
  /** The project's suggestion set, computed on the SERVER (favorites ∪ statistic). */
  suggestions: SuggestedArticle[];
  /** Which of them are favourites — they get the ★ and sort first. */
  favoriteIds: string[];
  /**
   * The project's recipes with their article identities. Empty when the feature is off or the
   * project has none — in both cases the sheet stays exactly the one-pane sheet it was, which is
   * the spec's „nothing changes for a project that never turns this on“.
   */
  recipes?: RecipeForPicker[];
  /** The project's own wording, or null when the feature is off. */
  labels?: RecipeLabels | null;
  /** Hero card copy; the empty project uses a different pair (handoff 5b). */
  heroTitle: string;
  heroSubtitle: string;
  /** Server Action. Reads `name` and every `articleName` from the FormData. */
  createAction: (formData: FormData) => void | Promise<void>;
};

/**
 * The hero card plus the „Neue Liste" bottom sheet — the project screen's
 * signature action (handoff screen 3e + § State Management).
 *
 * Why the suggestions arrive as PROPS instead of a GET /suggestions fetch: the
 * page that renders this is a Server Component and has already read them. A
 * client fetch would add a round-trip, a loading state and a second source of
 * truth for data the server just held in its hand. (The meta plan's phrasing
 * "reads GET /suggestions first" describes the behaviour, not the transport; the
 * Slice 10 log fixed the transport as "server-owned data, client view state".)
 *
 * Why the selection is expressed as an EXCLUSION set: the design's default is
 * "everything is in", and a set of ids the user removed keeps that default true
 * even when the suggestion list changes between renders — an inclusion set would
 * silently drop newly-suggested articles.
 *
 * Why hidden inputs rather than JSON: the sheet is a plain <form> posting to a
 * Server Action, so the surviving selection travels as repeated `articleName`
 * fields — no serialisation format to agree on, and it degrades gracefully.
 */
export function NewListSheet({
  suggestions,
  favoriteIds,
  recipes = [],
  labels = null,
  heroTitle,
  heroSubtitle,
  createAction,
}: NewListSheetProps) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState(true);
  // Ids the user tapped away. Set (not array) because the only operations are
  // membership tests and toggles.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const favorites = new Set(favoriteIds);

  // Favourites first (they carry the ★ and are the "always" half of the rule),
  // each half keeping computeSuggestions' alphabetical order.
  const ordered = [
    ...suggestions.filter((article) => favorites.has(article.catalogItemId)),
    ...suggestions.filter((article) => !favorites.has(article.catalogItemId)),
  ];

  // What the list will actually start with. Empty when the toggle is off — that
  // is the difference between "pre-fill nothing" and "pre-fill an empty set".
  const selected = prefill
    ? ordered.filter((article) => !excluded.has(article.catalogItemId))
    : [];

  // Which pane is showing. There is no route change and no history entry: closing the sheet must
  // abandon the whole flow, not walk back through it.
  const [step, setStep] = useState<1 | 2>(1);
  // One count per recipe, 0 = „not chosen“ (spec §6).
  const [counts, setCounts] = useState<Record<string, number>>({});
  // One apply token for this creation attempt, generated lazily in the browser (ruling R1).
  const [token] = useState(() => crypto.randomUUID());

  // Step 2 exists only when there is something to pick. A project with the feature off, or with no
  // recipes yet, keeps the untouched one-pane sheet. Narrowing into a const (rather than a
  // non-null assertion at the render site) is what lets `recipeStepLabels` be used without `!`.
  const recipeStepLabels = recipes.length > 0 ? (labels ?? null) : null;
  const hasRecipeStep = recipeStepLabels !== null;

  const chosenRecipes = recipes.filter((recipe) => (counts[recipe.id] ?? 0) > 0);
  // Distinct articles the chosen recipes would add. A Set because two recipes asking for Milch is
  // ONE article — the number on the button counts articles, not rows (ruling R5).
  const recipeArticleIds = new Set(
    chosenRecipes.flatMap((recipe) => recipe.articles.map((article) => article.catalogItemId)),
  );
  // The suggestions the recipes already cover. Named in the note, never struck in step 1.
  const overlap = selected.filter((article) => recipeArticleIds.has(article.catalogItemId));
  const totalArticles = recipeArticleIds.size + selected.length - overlap.length;

  const toggleArticle = (catalogItemId: string) => {
    setExcluded((current) => {
      // A new Set on every change: mutating state in place would not re-render.
      const next = new Set(current);
      if (next.has(catalogItemId)) next.delete(catalogItemId);
      else next.add(catalogItemId);
      return next;
    });
  };

  // Re-open with a clean slate, so a cancelled attempt never leaks its
  // de-selections into the next list.
  const openSheet = () => {
    setPrefill(true);
    setExcluded(new Set());
    setStep(1);
    setCounts({});
    setOpen(true);
  };

  return (
    <>
      {/* The visually heaviest action on the screen — the signature feature gets
          the accent surface and the hero shadow. */}
      <button type="button" className={styles.hero} onClick={openSheet}>
        <span className={styles.heroTitle}>{heroTitle}</span>
        <span className={styles.heroSubtitle}>{heroSubtitle}</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Neue Liste">
        <form action={createAction} className={styles.form}>
          {/* Hidden, not unmounted: the name field and chip selection are <input>s
              inside this one <form>, and unmounting them would drop their values
              out of the submitted FormData. */}
          <div hidden={step === 2}>
            <TextField name="name" aria-label="Listenname" placeholder="Listenname" autoFocus />

            {/* No suggestions means nothing to preview and nothing to switch off —
                a young project simply names its list. */}
            {suggestions.length > 0 && (
              <>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>Vorbefüllen</span>
                  <span className={styles.toggleHint}>Favoriten + häufige Artikel</span>
                  <Toggle checked={prefill} onChange={setPrefill} label="Vorbefüllen" />
                </div>

                {prefill && (
                  <>
                    <div className={styles.chips}>
                      {ordered.map((article) => {
                        const dropped = excluded.has(article.catalogItemId);
                        const favorite = favorites.has(article.catalogItemId);
                        return (
                          <Chip
                            key={article.catalogItemId}
                            tone={favorite ? "accent" : "neutral"}
                            selected={!dropped}
                            struck={dropped}
                            onClick={() => toggleArticle(article.catalogItemId)}
                          >
                            {favorite ? `★ ${article.name}` : article.name}
                          </Chip>
                        );
                      })}
                    </div>
                    <p className={styles.legend}>
                      ★ Favoriten · übrige aus den letzten abgeschlossenen Listen
                    </p>
                  </>
                )}
              </>
            )}
          </div>

          {recipeStepLabels && step === 2 && (
            <div className={styles.recipeStep}>
              <ul className={styles.recipeRows}>
                {recipes.map((recipe) => (
                  <li key={recipe.id} className={styles.recipeRow}>
                    <span className={styles.recipeName}>{recipe.name}</span>
                    <Stepper
                      label={`Anzahl ${recipe.name}`}
                      value={counts[recipe.id] ?? 0}
                      onChange={(next) =>
                        setCounts((current) => ({ ...current, [recipe.id]: next }))
                      }
                    />
                  </li>
                ))}
              </ul>

              {/* Renders nothing when nothing overlaps — the helper returns "". */}
              {overlap.length > 0 && (
                <p className={styles.overlapNote}>
                  {formatRecipeOverlapNote(
                    overlap.map((article) => article.name),
                    recipeStepLabels,
                  )}
                </p>
              )}
            </div>
          )}

          {/* The selection travels as repeated fields; the action reads them with
              formData.getAll("articleName"). Only names — the catalog resolves
              them and supplies the defaults (see createListWithArticles). */}
          {selected.map((article) => (
            <input
              key={article.catalogItemId}
              type="hidden"
              name="articleName"
              value={article.name}
            />
          ))}

          {/* Rendered in both steps so a submit from either pane is complete. */}
          {hasRecipeStep && <input type="hidden" name="applyToken" value={token} />}
          {chosenRecipes.map((recipe) => (
            <input
              key={recipe.id}
              type="hidden"
              name="selection"
              value={`${recipe.id}:${counts[recipe.id]}`}
            />
          ))}

          <div className={styles.submit}>
            {hasRecipeStep && step === 1 ? (
              // „Weiter“, not a submit: a click must not post the form.
              <Button type="button" fullWidth onClick={() => setStep(2)}>
                Weiter
              </Button>
            ) : hasRecipeStep ? (
              <>
                <Button type="button" variant="text" onClick={() => setStep(1)}>
                  Zurück
                </Button>
                <Button type="submit" fullWidth>
                  {formatNewListWithRecipesLabel(totalArticles)}
                </Button>
              </>
            ) : (
              // The untouched one-pane path: same label, same promise, same dative plural.
              <Button type="submit" fullWidth>
                {formatNewListLabel(selected.length)}
              </Button>
            )}
          </div>
        </form>
      </Sheet>
    </>
  );
}
