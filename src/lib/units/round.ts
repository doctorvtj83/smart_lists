/**
 * Rounds a quantity to three decimals.
 *
 * Why it exists: float addition leaks precision — `0.1 + 0.2` is `0.30000000000000004`. The row
 * label would hide that (formatGermanNumber caps at maximumFractionDigits: 3), but the entry
 * sheet's MENGE field prints the stored number and would eventually surface it. Rounding at the
 * same precision the UI formats at keeps the stored value and the displayed value one thing.
 */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
