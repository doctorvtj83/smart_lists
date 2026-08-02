"use client";

import { useId } from "react";
import { Star } from "lucide-react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import type { FavoriteArticle } from "@/lib/favorites/favorites";
import styles from "./FavoritesEditor.module.css";

type FavoritesEditorProps = {
  /** Already sorted by the German comparator, straight from the server. */
  favorites: FavoriteArticle[];
  /** Catalog article names for the native autocomplete. */
  catalogNames: string[];
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
 * Autocomplete is a native <datalist> (the Slice 4/5 pattern): the browser
 * filters the pre-rendered options client-side with zero JS and zero requests.
 * The handoff's richer dropdown with a „„X" neu anlegen" row is the SAME control
 * Slice 12 builds for the trailing entry row — it is reused here once it exists,
 * rather than implemented twice.
 */
export function FavoritesEditor({
  favorites,
  catalogNames,
  addAction,
  removeAction,
}: FavoritesEditorProps) {
  // useId keeps the datalist id unique and stable across server render and
  // hydration — a hard-coded id would collide if this screen ever renders twice.
  const datalistId = useId();

  // Removal without nesting a button inside the add form: build the FormData by
  // hand and hand it to the Server Action directly.
  const removeFavorite = (catalogItemId: string) => {
    const formData = new FormData();
    formData.set("catalogItemId", catalogItemId);
    void removeAction(formData);
  };

  // Built once: it appears inside the empty state AND under the chips.
  const addRow = (
    <form action={addAction} className={styles.addRow}>
      <div className={styles.addField}>
        <TextField
          name="name"
          aria-label="Artikelname"
          placeholder="Artikelname"
          list={datalistId}
          autoComplete="off"
        />
      </div>
      <Button type="submit">Als Favorit</Button>
    </form>
  );

  return (
    <div className={styles.editor}>
      {/* One <datalist> for both branches — it is referenced by id, so it does
          not matter where in the tree it sits. */}
      <datalist id={datalistId}>
        {catalogNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

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
