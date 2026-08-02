"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { formatGermanNumber } from "@/lib/format/date";
import { parseGermanDecimal } from "@/lib/format/quantity";
import type { ListEntry } from "./EntryRow";
import styles from "./EntrySheet.module.css";

/**
 * The fields the user actually changed. A key that is ABSENT means "do not touch
 * this field"; a key set to null means "clear it". That distinction is the whole
 * point of the type — see the comment on `collectChanges`.
 */
export interface EntryChanges {
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
}

type EntrySheetProps = {
  /** The entry being edited. The sheet is only rendered when there is one. */
  entry: ListEntry;
  /** Every category the project knows, for the chip row. */
  categories: string[];
  /** German error from the last save attempt, e.g. an invalid quantity. */
  error: string | null;
  onClose: () => void;
  onSave: (changes: EntryChanges) => void;
  onDelete: () => void;
};

/**
 * The entry detail bottom sheet (handoff §10) — where Menge, Einheit and
 * Kategorie live now that the list screen has no add form.
 *
 * IMPORTANT for the caller: this component seeds its draft state from `entry`
 * once. Render it with `key={entry.id}` so switching entries remounts it — that
 * is the React idiom for "derive state from props on identity change", and it is
 * far more robust than syncing with an effect.
 */
export function EntrySheet({ entry, categories, error, onClose, onSave, onDelete }: EntrySheetProps) {
  // Drafts are strings, because that is what a text input holds. Converting only
  // on save keeps "1," mid-typing from being interpreted as a number.
  const [quantity, setQuantity] = useState(
    entry.quantity === null ? "" : formatGermanNumber(entry.quantity),
  );
  const [unit, setUnit] = useState(entry.unit ?? "");
  const [category, setCategory] = useState(entry.category ?? "");

  /**
   * Diffs the drafts against the entry and returns ONLY what changed.
   *
   * Why not just send all three: each field becomes its own `update_item`
   * operation, and the merge rule is per-field last-writer-wins. Sending an
   * untouched field would overwrite whatever another member changed on it while
   * this sheet was open — the exact conflict the field-granular operation model
   * exists to avoid (MVP design §4.5).
   */
  const collectChanges = (): EntryChanges => {
    const changes: EntryChanges = {};

    // NaN never equals the stored value, so invalid text is always "changed" and
    // travels to the server, which answers with the German validation message.
    const nextQuantity = parseGermanDecimal(quantity);
    if (!Object.is(nextQuantity, entry.quantity)) changes.quantity = nextQuantity;

    // Empty input means "clear", which is null on the column — never "".
    const nextUnit = unit.trim() || null;
    if (nextUnit !== entry.unit) changes.unit = nextUnit;

    const nextCategory = category.trim() || null;
    if (nextCategory !== entry.category) changes.category = nextCategory;

    return changes;
  };

  // Tapping the selected chip clears the category — the prototype's toggle
  // behaviour, and the only way to un-categorize an entry from the sheet.
  const pickCategory = (name: string) => {
    setCategory((current) => (current.trim() === name ? "" : name));
  };

  return (
    <Sheet open onClose={onClose} title={entry.name}>
      <div className={styles.fields}>
        <div className={styles.quantityField}>
          <TextField
            label="Menge"
            aria-label="Menge"
            placeholder="1,5"
            // Brings up the numeric keypad on iPhone; the comma still arrives as text.
            inputMode="decimal"
            fieldSize="sm"
            value={quantity}
            error={error}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>
        <div className={styles.unitField}>
          <TextField
            label="Einheit"
            aria-label="Einheit"
            placeholder="l"
            fieldSize="sm"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
          />
        </div>
        <div className={styles.categoryField}>
          <TextField
            label="Kategorie"
            aria-label="Kategorie"
            placeholder="Ohne Kategorie"
            fieldSize="sm"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
      </div>

      {/* No chips at all in a young project: an empty row would just be a gap. */}
      {categories.length > 0 && (
        <div className={styles.chips}>
          {categories.map((name) => (
            <Chip
              key={name}
              tone="neutral"
              selected={category.trim() === name}
              onClick={() => pickCategory(name)}
            >
              {name}
            </Chip>
          ))}
        </div>
      )}

      {/* Naming the flow-back is a deliberate design choice: the user is editing
          shared project memory, not just this one entry. */}
      <p className={styles.hint}>
        Kategorie und Einheit werden als neuer Standard im Katalog gemerkt.
      </p>

      <div className={styles.actions}>
        <Button fullWidth onClick={() => onSave(collectChanges())}>
          Fertig
        </Button>
        {/* No second confirmation: the sheet IS the deliberate surface, and this
            is the accessible counterpart of the swipe gesture. */}
        <Button variant="danger" onClick={onDelete}>
          Eintrag löschen
        </Button>
      </div>
    </Sheet>
  );
}
