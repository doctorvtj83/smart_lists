/**
 * The result shape both entry Server Actions return.
 *
 * Why the actions return state instead of throwing: „Menge muss eine positive
 * Zahl sein" has to land inline in the entry sheet, and a thrown error on a
 * Server Action produces Next.js's error overlay, not an inline message. Returning
 * state is what React 19's useActionState consumes. (Same reasoning, same shape
 * family as the Katalog screen's CatalogFormState.)
 */
export type EntryFormState = {
  /** German inline error from the last attempt, or null. */
  error: string | null;
  /** True after an action SUCCEEDED. The idle state has no error either, so
   *  `error === null` alone cannot tell "nothing happened" from "it worked". */
  ok: boolean;
  /**
   * Entry whose detail sheet should open right away — the design's „Neuer,
   * unbekannter Artikel ohne Kategorie → Eintrag-Sheet öffnet sich direkt".
   * null in every other case.
   */
  openEntryId: string | null;
};

/** The initial value both useActionState hooks start from. */
export const ENTRY_FORM_IDLE: EntryFormState = {
  error: null,
  ok: false,
  openEntryId: null,
};
