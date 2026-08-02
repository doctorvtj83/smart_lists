"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { Toggle } from "@/components/ui/Toggle";
import type { SuggestedArticle } from "@/lib/suggestions/suggestions";
import { formatNewListLabel } from "@/lib/format/plural";
import styles from "./NewListSheet.module.css";

type NewListSheetProps = {
  /** The project's suggestion set, computed on the SERVER (favorites ∪ statistic). */
  suggestions: SuggestedArticle[];
  /** Which of them are favourites — they get the ★ and sort first. */
  favoriteIds: string[];
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

          <div className={styles.submit}>
            {/* One helper owns the whole label, dative plural included. */}
            <Button type="submit" fullWidth>
              {formatNewListLabel(selected.length)}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
