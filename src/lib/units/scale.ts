import { canonicalUnit } from "@/lib/units/aliases";
import { round3 } from "@/lib/units/round";

/**
 * Scale-group metadata keyed by canonical display unit (U1).
 *
 * Factors express „how many base units“ one canonical unit equals: weight base g,
 * volume base ml, length base mm. Packaging/count/cooking units are omitted — they
 * are not convertible (U2).
 */
const SCALE_UNITS: Record<
  string,
  { group: "weight" | "volume" | "length"; factor: number }
> = {
  g: { group: "weight", factor: 1 },
  Pfund: { group: "weight", factor: 500 },
  kg: { group: "weight", factor: 1000 },
  ml: { group: "volume", factor: 1 },
  cl: { group: "volume", factor: 10 },
  dl: { group: "volume", factor: 100 },
  l: { group: "volume", factor: 1000 },
  mm: { group: "length", factor: 1 },
  cm: { group: "length", factor: 10 },
  m: { group: "length", factor: 1000 },
};

/**
 * Resolves a raw unit string to its scale-group entry, if any.
 *
 * WHY canonicalUnit first: free-text spellings („Liter“, „KG“) must map to the same
 * factors as the canonical row before we compare groups or convert.
 */
function scaleEntry(raw: string | null | undefined) {
  const canonical = canonicalUnit(raw);
  if (!canonical) return null;
  return SCALE_UNITS[canonical] ?? null;
}

/**
 * Whether two units belong to the same convertible scale group (weight, volume, or length).
 *
 * WHY false for unknown or packaging units: „Flasche“ canonicalises but has no factor row,
 * so two Flasche strings are not „same group“ for merge/convert purposes (U2).
 */
export function sameScaleGroup(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const entryA = scaleEntry(a);
  const entryB = scaleEntry(b);
  if (!entryA || !entryB) return false;
  return entryA.group === entryB.group;
}

/**
 * Converts a quantity from one unit to another within the same scale group.
 *
 * Returns null when units differ in group, either unit is unknown/non-scalable, or the
 * rounded result is zero (Review Focus 1 — avoids invalid positive-quantity validation
 * and zero-contribution merge replays).
 */
export function convertQuantity(
  quantity: number,
  from: string,
  to: string,
): number | null {
  const fromEntry = scaleEntry(from);
  const toEntry = scaleEntry(to);
  if (!fromEntry || !toEntry || fromEntry.group !== toEntry.group) {
    return null;
  }
  const converted = round3((quantity * fromEntry.factor) / toEntry.factor);
  if (converted === 0) return null;
  return converted;
}

/**
 * Expresses an add's quantity in the catalog's default unit when both are in one scale group.
 *
 * WHY preserve defaultUnit spelling: the row should read like the catalog („0,5 Liter“),
 * not force the canonical short form. Returns null when there is no default, the unit is
 * missing (inherit path — caller step 5), units do not share a group, or conversion would
 * round to zero. A null quantity with a same-group unit only replaces the unit.
 */
export function scaleToDefault(
  quantity: number | null,
  unit: string | null | undefined,
  defaultUnit: string | null,
): { quantity: number | null; unit: string | null | undefined } | null {
  if (defaultUnit === null) return null;
  // null and undefined both mean "no explicit unit" — narrow before convertQuantity's string params.
  if (unit == null) return null;
  if (!sameScaleGroup(unit, defaultUnit)) return null;

  if (quantity === null) {
    return { quantity: null, unit: defaultUnit };
  }

  const converted = convertQuantity(quantity, unit, defaultUnit);
  if (converted === null) return null;
  return { quantity: converted, unit: defaultUnit };
}
