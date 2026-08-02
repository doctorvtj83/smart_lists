"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { TextField } from "@/components/ui/TextField";
import type { CatalogArticle } from "@/lib/catalog/manage";
import { formatUsedInLists } from "@/lib/format/plural";
import styles from "./CatalogEditPanel.module.css";

type CatalogEditPanelProps = {
  article: CatalogArticle;
  /** German inline error from the last save attempt; sits on the NAME field. */
  error: string | null;
  /** The edit action's dispatch, owned by CatalogBrowser (useActionState). */
  formAction: (formData: FormData) => void;
  /** Fires the same action imperatively once the deletion is confirmed. */
  onConfirmDelete: () => void;
  onCancel: () => void;
};

/**
 * The inline edit panel that replaces a tapped catalog row (handoff § 8).
 *
 * Presentational on purpose: the only state it owns is whether the confirmation
 * sheet is open. The form's action and the delete callback are props, so the page
 * keeps ownership of the mutations (and of their membership re-checks) — the same
 * split Slice 14's RevokeSheet uses.
 *
 * The fields are UNCONTROLLED (defaultValue): the values are only read on submit,
 * and typing must not cost a re-render of the surrounding list. The panel is
 * mounted fresh whenever a different row opens, which is what re-seeds them.
 */
export function CatalogEditPanel({
  article,
  error,
  formAction,
  onConfirmDelete,
  onCancel,
}: CatalogEditPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // The one product rule of this screen: an article on any list — active or
  // archived — cannot be deleted, because the suggestion statistic reads them.
  const deletable = article.usedInListCount === 0;

  return (
    // NOT the Card primitive: the design gives this panel an accent-tinted border
    // and its own shadow, and overriding Card's border across two CSS Modules
    // depends on stylesheet injection order, which Next.js does not guarantee.
    // The surface is therefore drawn here, deliberately and once.
    <div className={styles.panel}>
      <form action={formAction} className={styles.form}>
        {/* The action is a POST endpoint of its own — it must learn its target
            from the payload, never from component state. */}
        <input type="hidden" name="catalogItemId" value={article.id} />
        <TextField
          label="Name"
          name="name"
          defaultValue={article.name}
          error={error}
          fieldSize="sm"
        />
        <div className={styles.defaults}>
          <TextField
            label="Standard-Kategorie"
            name="category"
            defaultValue={article.defaultCategory ?? ""}
            fieldSize="sm"
          />
          <div className={styles.unitField}>
            <TextField
              label="Einheit"
              name="unit"
              defaultValue={article.defaultUnit ?? ""}
              fieldSize="sm"
            />
          </div>
        </div>
        <div className={styles.actions}>
          {/* name/value ride along in the FormData, which is how one action
              serves both intents without a second form. */}
          <Button type="submit" name="intent" value="save">
            Speichern
          </Button>
          <Button variant="text" onClick={onCancel}>
            Abbrechen
          </Button>
          <span className={styles.spacer} />
          {deletable && (
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Löschen
            </Button>
          )}
        </div>
      </form>

      {/* Not disabled — absent, per the handoff's destructive-action pattern. The
          note takes the button's place so the absence is explained. */}
      {!deletable && (
        <p className={styles.note}>
          Löschen nicht möglich — {formatUsedInLists(article.usedInListCount)}.
        </p>
      )}

      {/* A favourite is not a usage, so the delete goes through — but it takes the
          favourite with it (FK cascade), and that must never be a surprise. */}
      {deletable && article.isFavorite && (
        <p className={styles.note}>
          Ist ein Favorit — wird beim Löschen auch aus den Favoriten entfernt.
        </p>
      )}

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Artikel löschen: ${article.name}`}
        options={[
          {
            label: "Artikel löschen",
            description: article.isFavorite
              ? "Der Artikel verschwindet aus dem Katalog und aus den Favoriten."
              : "Der Artikel verschwindet aus dem Katalog.",
            tone: "danger",
            onSelect: onConfirmDelete,
          },
        ]}
      />
    </div>
  );
}
