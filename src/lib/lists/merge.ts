/**
 * The merge DECISION, as pure functions (recipes design §3, D1/D2).
 *
 * Why a separate module rather than a few private helpers inside operations.ts: this is the
 * subtlest rule in the feature — nine ways to say "no" and one to say "yes" — and it is the piece
 * that must be provable without a database. Keeping it pure turns the design's truth table into a
 * literal test table (merge.test.ts) and leaves operations.ts to do the one thing it is about:
 * writing. Nothing here touches Prisma, so Slice 19's recipe apply can reuse the same rule.
 */

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

/**
 * Collapses a unit to its comparison key: trimmed, lowercased, and blank -> null.
 *
 * Case-insensitive because the entry sheet accepts free text: „L" and „l" are the same litre.
 * Blank -> null because a cleared input yields "" while the column normally holds null — without
 * this they would be two different "no unit" buckets and an add would refuse to merge for a reason
 * no user could see.
 */
function unitKey(unit: string | null): string | null {
  const trimmed = unit?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/** Do these two units belong to the same bucket? „No unit" is its own bucket (D1). */
export function unitsMatch(a: string | null, b: string | null): boolean {
  return unitKey(a) === unitKey(b);
}

/**
 * A row the incoming add might be absorbed by. Structurally a subset of Prisma's `ListItem`, so the
 * funnel passes loaded rows straight in with no mapping step.
 */
export interface MergeCandidate {
  id: string;
  catalogItemId: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  sortIndex: number;
}

/**
 * A candidate that PASSED: same article, same unit, unchecked, and quantified. The narrowed
 * `quantity` is the point — the caller adds to it without a non-null assertion, because the rule
 * that guarantees it lives here and nowhere else.
 */
export interface MergeTarget extends MergeCandidate {
  quantity: number;
}

/** The add being applied, after unit inheritance has been resolved (operations.ts step 5). */
export interface IncomingEntry {
  catalogItemId: string;
  quantity: number | null;
  unit: string | null;
}

/**
 * Picks the row an incoming add should be added to, or null when it must become its own row.
 *
 * ALL FIVE RULES LIVE HERE, including the article check the caller's query already performed
 * (ruling R3). The caller narrows the candidate set for cost; this function decides. Duplicating
 * a rule into the `where` clause would be exactly how the two drift apart.
 *
 * Ties break on the LOWEST sortIndex — the row nearest the top of the list, which is the one the
 * user is most likely looking at. The loop does not assume the input is sorted: the caller orders
 * the query for readability, but correctness must not depend on it.
 */
export function findMergeTarget(
  candidates: MergeCandidate[],
  incoming: IncomingEntry,
): MergeTarget | null {
  // D1: an add with no quantity has no number to contribute. Checked first because it disqualifies
  // every candidate at once — the caller uses the same fact to skip the query entirely.
  if (incoming.quantity === null) return null;

  let best: MergeTarget | null = null;
  for (const candidate of candidates) {
    // Destructured so the null check narrows the VALUE, which is what builds the MergeTarget below
    // without a cast (`candidate.quantity` would stay `number | null` after the spread).
    const { quantity } = candidate;
    if (quantity === null) continue; // D1: both sides must carry a quantity
    if (candidate.checked) continue; // D2: a settled row never absorbs
    if (candidate.catalogItemId !== incoming.catalogItemId) continue; // same article only
    if (!unitsMatch(candidate.unit, incoming.unit)) continue; // same unit bucket, no conversion
    if (best === null || candidate.sortIndex < best.sortIndex) best = { ...candidate, quantity };
  }
  return best;
}

/**
 * What a merge did, for the callers that have to show it (recipes design §3, "Making a merge
 * visible"). Declared in this pure module rather than next to applyOperation so the client-side
 * `EntryFormState` can import the type without pulling Prisma into a client bundle.
 */
export interface MergeOutcome {
  /** The row that absorbed the add — the one to highlight. NOT the id the client sent. */
  targetItemId: string;
  /** The article's display name, for „Zu 1 l Milch addiert". */
  name: string;
  /** The target's quantity BEFORE this add. */
  previousQuantity: number;
  /** The target's quantity AFTER it. */
  quantity: number;
  /** The target's unit — unchanged by the merge; the existing row wins every field but the number. */
  unit: string | null;
}
