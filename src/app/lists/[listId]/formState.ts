import type { MergeOutcome } from "@/lib/lists/merge";

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
  /**
   * Which entry the result belongs to — same role as CatalogFormState.articleId.
   * Without it, a failed save's error would still sit in useActionState and paint
   * onto the next entry the user opens (or a needsCategory sheet after add).
   */
  itemId: string | null;
  /**
   * Set when the add was ABSORBED by a row that was already on the list (Slice 17). The row's
   * quantity changed without a new row appearing, which reads as a bug unless it is announced —
   * so this drives both the banner and the target row's highlight. null for every other outcome.
   *
   * A type-only import: MergeOutcome lives in the pure merge module precisely so this
   * client-imported file never pulls Prisma types into the browser bundle.
   */
  merge: MergeOutcome | null;
};

/** The initial value both useActionState hooks start from. */
export const ENTRY_FORM_IDLE: EntryFormState = {
  error: null,
  ok: false,
  openEntryId: null,
  itemId: null,
  merge: null,
};
