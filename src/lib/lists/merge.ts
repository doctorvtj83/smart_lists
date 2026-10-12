/**
 * The merge DECISION, as pure functions (recipes design §3, D1/D2).
 *
 * Why a separate module rather than a few private helpers inside operations.ts: this is the
 * subtlest rule in the feature — the ways to say "no" and the two ways to say "yes" (sum vs.
 * presence) — and it is the piece that must be provable without a database. Keeping it pure turns
 * the design's truth table into a literal test table (merge.test.ts) and leaves operations.ts to
 * do the one thing it is about: writing. Nothing here touches Prisma, so Slice 19's recipe apply
 * can reuse the same rule. Scale-group conversion also lives here because the merge decision must
 * reject contributions that cannot be represented safely in the existing row's unit.
 */

import { formatQuantityLabel } from "@/lib/format/quantity";
import { canonicalUnit } from "@/lib/units/aliases";
import { convertQuantity, sameScaleGroup } from "@/lib/units/scale";

export { round3 } from "@/lib/units/round";

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
 * A candidate that PASSED: same article, compatible unit scale group, unchecked, and either both
 * sides quantified (the converted contribution will be added) or both unquantified (the incoming
 * add is absorbed as presence).
 *
 * `contribution` is expressed in the target row's unit so the write path can add it directly.
 * It stays null for a presence merge because inventing a number for an unquantified item would
 * violate D1.
 */
export type MergeTarget = MergeCandidate & { contribution: number | null };

/** The add being applied, after unit inheritance has been resolved (operations.ts step 5). */
export interface IncomingEntry {
  catalogItemId: string;
  quantity: number | null;
  unit: string | null;
}

/**
 * Picks the row an incoming add should be added to, or null when it must become its own row.
 *
 * ALL RULES LIVE HERE, including the article check the caller's query already performed
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
  let best: MergeTarget | null = null;
  for (const candidate of candidates) {
    if (candidate.checked) continue; // D2: a settled row never absorbs
    if (candidate.catalogItemId !== incoming.catalogItemId) continue; // same article only
    const exactUnitMatch = unitsMatch(candidate.unit, incoming.unit);
    const scaleGroupMatch = sameScaleGroup(candidate.unit, incoming.unit);
    if (!exactUnitMatch && !scaleGroupMatch) continue; // same exact unit or convertible scale group
    // D1: merge when BOTH sides carry a quantity (there is a number to add) OR when NEITHER
    // does (the incoming add is the same unquantified wish already on the list — a second
    // „Salz" row would be a duplicate with nothing to tell the two apart). Mixed pairs stay
    // apart: a bare wish next to a measured amount is two different statements, not a sum.
    const bothQuantified = incoming.quantity !== null && candidate.quantity !== null;
    const bothUnquantified = incoming.quantity === null && candidate.quantity === null;
    if (!bothQuantified && !bothUnquantified) continue;

    let contribution: number | null = null;
    if (incoming.quantity !== null && candidate.quantity !== null) {
      // Aliases that resolve to one canonical unit need no arithmetic; preserving the incoming
      // value also avoids needless floating-point work for spellings such as „Liter“ and „l“.
      const sameCanonicalUnit =
        canonicalUnit(candidate.unit) === canonicalUnit(incoming.unit);
      if (exactUnitMatch || sameCanonicalUnit) {
        contribution = incoming.quantity;
      } else {
        // Reaching conversion implies a scale-group match, whose units are always non-null. The
        // explicit guard makes that invariant visible to TypeScript and keeps this boundary total.
        if (incoming.unit === null || candidate.unit === null) continue;
        contribution = convertQuantity(incoming.quantity, incoming.unit, candidate.unit);
      }
      // A conversion that rounds to zero is not a valid contribution and therefore cannot merge.
      if (contribution === null) continue;
    }

    if (best === null || candidate.sortIndex < best.sortIndex) {
      best = { ...candidate, contribution };
    }
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
  /** The target's quantity BEFORE this add. Null on a presence merge (neither side had a number). */
  previousQuantity: number | null;
  /** The target's quantity AFTER it. Null on a presence merge — the row did not change. */
  quantity: number | null;
  /** The target's unit — unchanged by the merge; the existing row wins every field but the number. */
  unit: string | null;
}

/**
 * The German sentence that makes a merge visible: „Zu 1 l Milch addiert → 3 l".
 *
 * Why the copy lives next to the rule rather than in the component: a row silently changing from
 * 2 l to 3 l reads as a bug, so this sentence is part of the feature, not decoration — and putting
 * it here makes it testable without a DOM. It reuses formatQuantityLabel, so the German decimal
 * comma and the "quantity without a unit" case are handled exactly as the row label handles them.
 */
export function formatMergeMessage(merge: MergeOutcome): string {
  // A presence merge did not change a number — there is no „Zu X addiert → Y" to say. Callers that
  // render this banner (ListBody) also skip it when quantity is null; this keeps the function total
  // on the new outcome shape rather than producing „Zu  Salz addiert → ".
  if (merge.previousQuantity === null || merge.quantity === null) return "";
  const before = formatQuantityLabel(merge.previousQuantity, merge.unit);
  const after = formatQuantityLabel(merge.quantity, merge.unit);
  return `Zu ${before} ${merge.name} addiert → ${after}`;
}
