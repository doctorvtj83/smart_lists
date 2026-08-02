"use client";

import { startTransition, useActionState, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import type { CatalogArticle } from "@/lib/catalog/manage";
import { normalizeName } from "@/lib/catalog/normalize";
import { formatArticleDefaults } from "@/lib/format/plural";
import { CatalogEditPanel } from "./CatalogEditPanel";
import { CATALOG_FORM_IDLE, type CatalogFormState } from "./formState";
import styles from "./CatalogBrowser.module.css";

/** Both Server Actions have the useActionState signature. */
type CatalogAction = (prev: CatalogFormState, formData: FormData) => Promise<CatalogFormState>;

type CatalogBrowserProps = {
  /** The WHOLE catalog, already sorted, straight from the server on every render. */
  articles: CatalogArticle[];
  createAction: CatalogAction;
  editAction: CatalogAction;
};

/**
 * The Katalog screen's interactive body.
 *
 * Why this is the only client component here: the design filters as you type and
 * opens a panel in place of the tapped row — both are pure view state, and both
 * would otherwise cost a server round-trip per keystroke or per tap. The DATA
 * still never comes from the client: `articles` is a prop, so after any mutation
 * the Server Action's revalidatePath re-renders the page and this component is
 * handed a fresh array while its own state (search text, open row) survives.
 *
 * Why two useActionState hooks instead of one: the create row and the edit panel
 * fail independently, and a collision while creating must not paint an error into
 * a panel (or vice versa).
 *
 * Why panel open/close is driven from the action wrappers (not useEffect): the
 * React Compiler lint forbids setState synchronously inside an effect. Wrapping
 * the Server Actions lets us adjust `openId` in the same async turn that produces
 * the new form state — still after the await, so it is not a cascading render
 * during the effect phase, and the create/edit error paths stay independent.
 */
export function CatalogBrowser({ articles, createAction, editAction }: CatalogBrowserProps) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // „legt an und öffnet direkt das Bearbeiten-Panel" (handoff § 8): the new
  // article arrives via the revalidated props; opening happens here once the
  // create action returns a createdId.
  const [createState, createFormAction] = useActionState(
    async (prev: CatalogFormState, formData: FormData) => {
      const next = await createAction(prev, formData);
      if (next.createdId) setOpenId(next.createdId);
      return next;
    },
    CATALOG_FORM_IDLE,
  );

  // A successful save or delete closes the panel. A failed one must NOT — the
  // user needs to see the error next to the field that caused it.
  const [editState, editFormAction] = useActionState(
    async (prev: CatalogFormState, formData: FormData) => {
      const next = await editAction(prev, formData);
      if (next.ok) setOpenId(null);
      return next;
    },
    CATALOG_FORM_IDLE,
  );
  // Reusing normalizeName means the filter obeys the same identity rule as the
  // catalog ("MIL" finds "Milch"). Substring rather than prefix on purpose: this
  // is a management screen, not autocomplete — searchCatalog stays prefix-only.
  const needle = normalizeName(query);
  const visible = needle
    ? articles.filter((article) => normalizeName(article.name).includes(needle))
    : articles;

  // Built once: it appears inside the empty state AND above the list.
  const createRow = (
    <form action={createFormAction} className={styles.createRow}>
      <TextField
        name="name"
        placeholder="Neuen Artikel anlegen…"
        aria-label="Neuen Artikel anlegen"
        error={createState.error}
        fieldSize="sm"
      />
      <Button type="submit" aria-label="Artikel anlegen">
        <Icon icon={Plus} />
      </Button>
    </form>
  );

  // Empty state 5f. No search field: there is nothing to search, and the create
  // row belongs directly under the copy (handoff § Empty States).
  if (articles.length === 0) {
    return (
      <div className={styles.empty}>
        <EmptyState
          icon={<Icon icon={Search} size={24} />}
          shape="square"
          title="Der Katalog füllt sich von selbst"
          description="Jeder Artikel, den du auf einer Liste verwendest, wird hier gesammelt — mit Standard-Kategorie und -Einheit."
        >
          {createRow}
        </EmptyState>
      </div>
    );
  }

  // The confirmed delete reuses the EDIT action rather than a third one: same
  // target, same guard, same result shape. FormData is built by hand because the
  // confirmation lives in a sheet, outside the panel's <form>.
  const deleteArticle = (article: CatalogArticle) => {
    const formData = new FormData();
    formData.set("catalogItemId", article.id);
    formData.set("intent", "delete");
    // startTransition keeps the dispatch off the synchronous click path, which is
    // what React expects for an action fired outside a form submission.
    startTransition(() => editFormAction(formData));
  };

  return (
    <div className={styles.browser}>
      {/* Deliberately NOT the TextField primitive: the design draws search as a
          filled pill with a leading glyph and no border — a different control
          from the bordered form field TextField owns. */}
      <div className={styles.search}>
        <Icon icon={Search} size={15} className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Artikel suchen…"
          aria-label="Artikel suchen"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {createRow}

      {visible.length === 0 ? (
        <p className={styles.noHits}>Keine Treffer für „{query.trim()}“.</p>
      ) : (
        <ul className={styles.rows}>
          {visible.map((article) => (
            <li key={article.id}>
              {article.id === openId ? (
                <CatalogEditPanel
                  article={article}
                  // Only the error that belongs to THIS article — otherwise a
                  // failed save would follow the user to the next panel.
                  error={editState.articleId === article.id ? editState.error : null}
                  formAction={editFormAction}
                  onConfirmDelete={() => deleteArticle(article)}
                  onCancel={() => setOpenId(null)}
                />
              ) : (
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => setOpenId(article.id)}
                >
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{article.name}</span>
                    <span className={styles.rowMeta}>
                      {formatArticleDefaults(article.defaultCategory, article.defaultUnit)}
                    </span>
                  </span>
                  <Icon icon={ChevronRight} className={styles.chevron} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
