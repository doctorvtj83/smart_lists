"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { Banner } from "@/components/ui/Banner";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { useCatalogSearch } from "@/components/ui/useCatalogSearch";
import { buildAutocomplete } from "@/lib/catalog/autocomplete";
import type { FavoriteArticle } from "@/lib/favorites/favorites";
import styles from "./FavoritesEditor.module.css";

type FavoritesEditorProps = {
  /** Already sorted by the German comparator, straight from the server. */
  favorites: FavoriteArticle[];
  /** Needed to address the catalog endpoint the suggestion dropdown fetches from. */
  projectId: string;
  /** Server Actions. `add` reads `name`, `remove` reads `catalogItemId`. */
  addAction: (formData: FormData) => void | Promise<void>;
  removeAction: (formData: FormData) => void | Promise<void>;
};

/**
 * The Favoriten screen's body (handoff screen 3g / empty state 5e).
 *
 * Why a client component when it holds no state: `Chip`'s remove control is a
 * callback, not a form submit — a <button> inside a chip inside a form would
 * submit the ADD form. Wrapping each removal in its own tiny form and dispatching
 * it from the callback keeps the mutation a Server Action while the chip stays
 * the primitive the design asks for.
 *
 * Autocomplete is the shared `Autocomplete` primitive — the same control the
 * list screen's trailing entry row uses. Slice 11 shipped a native <datalist>
 * here and deliberately deferred this swap so the richer dropdown (with the
 * „…“ neu anlegen row) would exist exactly once. Enter and a picked suggestion
 * both dispatch the same Server Action.
 *
 * Slice 8 replaced the `articles` prop with useCatalogSearch: the screen no
 * longer server-renders the project's whole catalog just to filter it locally.
 */
export function FavoritesEditor({
  favorites,
  projectId,
  addAction,
  removeAction,
}: FavoritesEditorProps) {
  // Typed text lives here now: Autocomplete is controlled, and picking a
  // suggestion must be able to submit a name the field never held.
  const [draft, setDraft] = useState("");
  // Slice 8: the catalog is fetched per keystroke instead of arriving as a prop.
  // There is no quantity parser on this screen, so the raw draft IS the query —
  // simpler than the list screen's trailing row, same hook.
  const articles = useCatalogSearch(projectId, draft);
  const suggestions = buildAutocomplete(articles, draft);

  // Removal without nesting a button inside the add form: build the FormData by
  // hand and hand it to the Server Action directly.
  const removeFavorite = (catalogItemId: string) => {
    const formData = new FormData();
    formData.set("catalogItemId", catalogItemId);
    void removeAction(formData);
  };

  // The add row is no longer a <form>, so the Server Action is dispatched with a
  // hand-built FormData — the same shape it already reads (`name`).
  const addFavorite = (name: string) => {
    const formData = new FormData();
    formData.set("name", name);
    setDraft("");
    void addAction(formData);
  };

  // Built once: it appears inside the empty state AND under the chips.
  const addRow = (
    <div className={styles.addRow}>
      <Autocomplete
        value={draft}
        onChange={setDraft}
        onSubmit={addFavorite}
        options={suggestions.options}
        createName={suggestions.createName}
        placeholder="Artikelname"
        inputLabel="Artikelname"
      />
    </div>
  );

  return (
    <div className={styles.editor}>
      {favorites.length === 0 ? (
        <div className={styles.empty}>
          <EmptyState
            icon={<Icon icon={Star} size={22} />}
            tone="accent"
            title="Noch keine Favoriten"
            description="Favoriten landen automatisch in jeder vorbefüllten Liste — perfekt für Milch, Brot & Co."
          >
            {addRow}
          </EmptyState>
        </div>
      ) : (
        <>
          <Banner tone="info" icon={<Icon icon={Star} size={14} />}>
            Favoriten landen automatisch in <b>jeder</b> vorbefüllten Liste dieses Projekts.
          </Banner>

          <div className={styles.chips}>
            {favorites.map((favorite) => (
              <Chip
                key={favorite.catalogItemId}
                tone="outline"
                onRemove={() => removeFavorite(favorite.catalogItemId)}
                removeLabel={`${favorite.name} entfernen`}
              >
                {favorite.name}
              </Chip>
            ))}
          </div>

          {addRow}
        </>
      )}
    </div>
  );
}
