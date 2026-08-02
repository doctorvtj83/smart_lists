import { formatGermanNumber } from "./date";

/**
 * The entry quantity, in both directions.
 *
 * Why its own module rather than more functions in `date.ts`: this pair is the
 * round-trip of ONE field — what the entry sheet reads out of a text input and
 * what the entry row prints back. Keeping them together means the day the unit
 * handling changes, both halves are in front of you.
 */

/**
 * Reads the entry sheet's MENGE field.
 *
 * Returns `null` for an empty field — that is a real value: it CLEARS the
 * quantity via `update_item`, which is different from "leave it alone".
 *
 * Returns `NaN` for text that is not a number, deliberately and without
 * throwing. `applyOperation`'s `assertValidQuantity` already rejects non-finite
 * values with the German message „Menge muss eine positive Zahl sein", so
 * letting NaN travel gives the user that exact message inline instead of a
 * second, divergent validation rule here. Do not "fix" this by returning null:
 * that would silently erase the quantity when the user fat-fingers a letter.
 */
export function parseGermanDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // German keyboards produce "1,5". Number() only understands "1.5", so the
  // comma is swapped first; a second comma survives the swap and yields NaN,
  // which is what we want for "1,5,5".
  return Number(trimmed.replace(",", "."));
}

/**
 * The entry row's trailing label, e.g. "1,5 l" (handoff §10).
 *
 * Both halves are optional and independently missing, so this collapses to
 * whichever exists and to "" when neither does — the row then renders nothing
 * rather than a stray separator.
 */
export function formatQuantityLabel(quantity: number | null, unit: string | null): string {
  const parts: string[] = [];
  if (quantity !== null) parts.push(formatGermanNumber(quantity));
  // A blank unit is stored as null in practice, but trim defensively: the column
  // is free text and a legacy row could hold spaces.
  const trimmedUnit = unit?.trim();
  if (trimmedUnit) parts.push(trimmedUnit);
  return parts.join(" ");
}
