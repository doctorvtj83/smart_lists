"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { ChipTabs } from "@/components/ui/ChipTabs";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { buildAutocomplete, type AutocompleteArticle } from "@/lib/catalog/autocomplete";
import {
  ALL_CATEGORIES_LABEL,
  categoryChipOptions,
  categoryLabel,
  groupItemsByCategory,
} from "@/lib/lists/categories";
import { EntryRow, type ListEntry } from "./EntryRow";
import { EntrySheet, type EntryChanges } from "./EntrySheet";
import { ENTRY_FORM_IDLE, type EntryFormState } from "./formState";
import styles from "./ListBody.module.css";

/** The two entry actions have the useActionState signature; see formState.ts. */
type EntryAction = (prev: EntryFormState, formData: FormData) => Promise<EntryFormState>;
/** Check and remove need no inline error, so they stay plain Server Actions. */
type FireAndForgetAction = (formData: FormData) => void | Promise<void>;

type ListBodyProps = {
  /** Every entry, in sortIndex order, straight from the server on every render. */
  entries: ListEntry[];
  /** The project's catalog, for the trailing row's autocomplete. */
  articles: AutocompleteArticle[];
  /** Every category the project knows, for the entry sheet's chips. */
  categories: string[];
  /** A completed list: read-only, no chips, no input row (handoff §10). */
  frozen: boolean;
  addAction: EntryAction;
  updateAction: EntryAction;
  checkAction: FireAndForgetAction;
  removeAction: FireAndForgetAction;
};

/**
 * The interactive body of the list screen (handoff §10) — the piece Slice 12 is
 * really about.
 *
 * WHY this is a client component when nothing else on the screen is: the filter
 * chips, the typed text in the trailing row and the swipe gesture are all view
 * state that changes many times per second. A server round-trip per keystroke is
 * exactly what the design's "trailing empty row" cannot afford. The DATA is still
 * server-owned: `entries`, `articles` and `categories` are props, so after every
 * mutation `revalidatePath` hands this component a fresh array while its own
 * state (active chip, typed text, open sheet) survives — the same split
 * `CatalogBrowser` established, and the reason `ListSyncPoller`'s
 * `router.refresh()` keeps working untouched.
 *
 * WHY the mutations are Server Actions rather than fetches to /api/.../ops: both
 * funnel into the same `applyOperation` core, and a Server Action re-derives
 * identity server-side without a client-held session. The REST endpoint stays for
 * the Phase 2 offline queue, which is what it was built for.
 */
export function ListBody({
  entries,
  articles,
  categories,
  frozen,
  addAction,
  updateAction,
  checkAction,
  removeAction,
}: ListBodyProps) {
  const [activeChip, setActiveChip] = useState(ALL_CATEGORIES_LABEL);
  const [draft, setDraft] = useState("");
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  // Keeps the cursor in the trailing row after a submit — "Enter legt an und
  // fokussiert die nächste leere Zeile" (handoff §10). There is only ever one
  // trailing row, so "the next empty row" IS this input, cleared.
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Wrapping the action lets us open the sheet in the same async turn that
  // produced the new state — after the await, so it is not a setState cascade
  // inside an effect (the React Compiler lint rule CatalogBrowser ran into).
  const [addState, dispatchAdd] = useActionState(async (prev: EntryFormState, formData: FormData) => {
    const next = await addAction(prev, formData);
    if (next.openEntryId) setOpenEntryId(next.openEntryId);
    return next;
  }, ENTRY_FORM_IDLE);

  const [updateState, dispatchUpdate] = useActionState(
    async (prev: EntryFormState, formData: FormData) => {
      const next = await updateAction(prev, formData);
      // A FAILED save must keep the sheet open — the user has to see the message
      // next to the field that caused it.
      if (next.ok) setOpenEntryId(null);
      return next;
    },
    ENTRY_FORM_IDLE,
  );

  // Chips are derived from the entries; `activeChip` is passed in so the selected
  // one survives its category going empty.
  const chipOptions = categoryChipOptions(entries, activeChip);
  const visible =
    activeChip === ALL_CATEGORIES_LABEL
      ? entries
      : entries.filter((item) => categoryLabel(item.category) === activeChip);
  const groups = activeChip === ALL_CATEGORIES_LABEL ? groupItemsByCategory(visible) : [];

  const suggestions = buildAutocomplete(articles, draft);
  const openEntry = entries.find((item) => item.id === openEntryId) ?? null;

  /** The trailing row's submit: one add_item with a client-generated identity. */
  const addEntry = (name: string) => {
    const formData = new FormData();
    // Client-generated UUID (MVP design §3): stable identity across retries, and
    // it is what lets the action tell us WHICH entry to open the sheet on.
    formData.set("itemId", crypto.randomUUID());
    formData.set("name", name);
    // Absent means „Alle" — inherit the catalog default (see addEntryFromRow).
    if (activeChip !== ALL_CATEGORIES_LABEL) formData.set("category", activeChip);

    setDraft("");
    inputRef.current?.focus();
    // startTransition is what React expects for an action dispatched outside a
    // <form> submission.
    startTransition(() => dispatchAdd(formData));
  };

  const toggleEntry = (entry: ListEntry, checked: boolean) => {
    const formData = new FormData();
    formData.set("itemId", entry.id);
    // The TARGET state, not a toggle — check_item is idempotent by construction.
    formData.set("checked", String(checked));
    startTransition(() => void checkAction(formData));
  };

  const removeEntry = (entryId: string) => {
    const formData = new FormData();
    formData.set("itemId", entryId);
    setOpenEntryId(null);
    startTransition(() => void removeAction(formData));
  };

  /** Only the fields the sheet reports as changed are put on the wire. */
  const saveEntry = (entryId: string, changes: EntryChanges) => {
    // Nothing changed: closing without a request is the honest outcome.
    if (Object.keys(changes).length === 0) {
      setOpenEntryId(null);
      return;
    }
    const formData = new FormData();
    formData.set("itemId", entryId);
    // A PRESENT key means "change this field"; null becomes "" and the action
    // maps it back to null. An absent key is never touched — that is what keeps
    // a concurrent remote edit to another field intact under last-writer-wins.
    if ("quantity" in changes) formData.set("quantity", changes.quantity === null ? "" : String(changes.quantity));
    if ("unit" in changes) formData.set("unit", changes.unit ?? "");
    if ("category" in changes) formData.set("category", changes.category ?? "");
    startTransition(() => dispatchUpdate(formData));
  };

  // The trailing input row, built once: it appears above the hint on an empty
  // list (mock 5c) and below it in an emptied filter (mock 5d).
  const trailingRow = (
    <Autocomplete
      value={draft}
      onChange={setDraft}
      onSubmit={addEntry}
      options={suggestions.options}
      createName={suggestions.createName}
      placeholder={
        activeChip === ALL_CATEGORIES_LABEL ? "Eintrag hinzufügen" : `Neu in „${activeChip}“`
      }
      inputLabel={
        activeChip === ALL_CATEGORIES_LABEL ? "Eintrag hinzufügen" : `Neu in „${activeChip}“`
      }
      inputRef={inputRef}
      leading={<span className={styles.plus} aria-hidden="true">＋</span>}
    />
  );

  const isEmptyList = entries.length === 0;
  const isEmptyFilter = !isEmptyList && visible.length === 0;

  return (
    <div className={styles.body}>
      {/* A completed list has no filter row at all (handoff §10). */}
      {!frozen && (
        <div className={styles.chips}>
          <ChipTabs
            options={chipOptions}
            value={activeChip}
            onChange={setActiveChip}
            label="Kategorien"
          />
        </div>
      )}

      <div className={styles.content}>
        {activeChip === ALL_CATEGORIES_LABEL
          ? groups.map((group) => (
              <section key={group.category}>
                <div className={styles.groupLabel}>
                  <SectionLabel>{group.category}</SectionLabel>
                </div>
                <ul className={styles.rows}>
                  {group.items.map((item) => (
                    <EntryRow
                      key={item.id}
                      entry={item}
                      frozen={frozen}
                      onToggle={(checked) => toggleEntry(item, checked)}
                      onOpen={() => setOpenEntryId(item.id)}
                      onDelete={() => removeEntry(item.id)}
                    />
                  ))}
                </ul>
              </section>
            ))
          : // Inside a filter the section labels would repeat the active chip.
            visible.length > 0 && (
              <ul className={styles.rows}>
                {visible.map((item) => (
                  <EntryRow
                    key={item.id}
                    entry={item}
                    frozen={frozen}
                    onToggle={(checked) => toggleEntry(item, checked)}
                    onOpen={() => setOpenEntryId(item.id)}
                    onDelete={() => removeEntry(item.id)}
                  />
                ))}
              </ul>
            )}

        {/* Empty state 5c: the input row IS the empty state, the sentence sits
            below it. */}
        {!frozen && isEmptyList && (
          <>
            {trailingRow}
            <p className={styles.emptyHint}>
              Einfach lostippen — jeder Eintrag mit ↵ legt gleich die nächste Zeile an.
            </p>
          </>
        )}

        {/* Empty state 5d: the explanation fills the space, the row stays at the
            bottom — and the user stays in the filter. */}
        {!frozen && isEmptyFilter && (
          <>
            <div className={styles.emptyFilter}>
              <p className={styles.emptyFilterTitle}>{`Nichts mehr in „${activeChip}“`}</p>
              <p className={styles.emptyFilterText}>
                Der letzte Eintrag wurde gerade entfernt. Du bleibst hier — oder zurück zu „Alle“.
              </p>
            </div>
            {trailingRow}
          </>
        )}

        {/* The normal case: the row trails the entries. */}
        {!frozen && !isEmptyList && !isEmptyFilter && trailingRow}

        {/* An add that failed validation (an empty name reaching the server, a
            name over the length cap) reports here — the row itself has no room. */}
        {addState.error ? <p className={styles.addError}>{addState.error}</p> : null}
      </div>

      {openEntry && (
        // key: remount on a different entry, so the sheet's drafts re-seed from
        // props instead of being synced by an effect.
        <EntrySheet
          key={openEntry.id}
          entry={openEntry}
          categories={categories}
          error={updateState.error}
          onClose={() => setOpenEntryId(null)}
          onSave={(changes) => saveEntry(openEntry.id, changes)}
          onDelete={() => removeEntry(openEntry.id)}
        />
      )}
    </div>
  );
}
