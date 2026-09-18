/**
 * German plural forms for the meta lines the design specifies.
 *
 * Why a module and not an inline ternary per screen: Home, Projekte and (later)
 * the drawer all print the same phrases. Centralising them means the wording is
 * changed once, and the singular/plural rule is covered by tests instead of by
 * five copies that drift apart.
 *
 * Only "exactly 1" takes the singular in German — 0 takes the plural
 * ("0 Listen"), which is the trap this module exists to get right.
 */
import type { RecipeLabels } from "@/lib/recipes/labels";

/** "1 Liste" / "3 Listen" — counts a project's ACTIVE lists. */
export function formatListCount(count: number): string {
  return `${count} ${count === 1 ? "Liste" : "Listen"}`;
}

/** "1 Mitglied" / "4 Mitglieder" — counts a project's memberships. */
export function formatMemberCount(count: number): string {
  return `${count} ${count === 1 ? "Mitglied" : "Mitglieder"}`;
}

/**
 * The project row's meta line, e.g. "3 Listen · 4 Mitglieder".
 * The separator is U+00B7 MIDDLE DOT surrounded by spaces — taken verbatim from
 * the handoff (screen 3d), not a hyphen and not a bullet.
 */
export function formatProjectMeta(listCount: number, memberCount: number): string {
  return `${formatListCount(listCount)} · ${formatMemberCount(memberCount)}`;
}

/** "5 offen" — the trailing meta on an active-list row (handoff screen 3e). */
export function formatOpenCount(open: number): string {
  return `${open} offen`;
}

/** "5 von 8 offen" — the Weitermachen card's counter (handoff screen 3c). */
export function formatOpenOfTotal(open: number, total: number): string {
  return `${open} von ${total} offen`;
}

/**
 * "124 Artikel" — the trailing count in the Katalog header (handoff § 8).
 *
 * "Artikel" is one of the German nouns whose plural equals its singular, so only
 * the number changes. It is still a function so no call site inlines the noun:
 * the day the header wants different wording, it changes in one place.
 */
export function formatArticleCount(count: number): string {
  return `${count} Artikel`;
}

/**
 * "wird in 3 Listen verwendet" — the reason a catalog article cannot be deleted.
 *
 * Why it is shared: the same sentence is printed twice from two different places
 * — as a note in the edit panel (from the read model) and inside the ApiError the
 * delete guard throws when someone else put the article on a list in the meantime.
 * They must read identically, so the wording lives here and nowhere else.
 */
export function formatUsedInLists(count: number): string {
  return `wird in ${formatListCount(count)} verwendet`;
}

/**
 * "Molkerei · l" — a catalog row's sub line (handoff § 8).
 *
 * Both defaults are nullable (unknown until someone sets them), so this collapses
 * to whichever values exist. The separator is U+00B7 MIDDLE DOT surrounded by
 * spaces, the same one formatProjectMeta uses.
 */
export function formatArticleDefaults(category: string | null, unit: string | null): string {
  // The type predicate is what narrows (string | null)[] to string[] for join().
  const parts = [category, unit].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return "Keine Vorgaben";
  return parts.join(" · ");
}

/**
 * The „Neue Liste"-Sheet's submit label, which counts live as the user drops
 * suggestions (handoff § State Management).
 *
 * Why the helper returns the WHOLE sentence rather than just "N Einträge": the
 * label reads „Liste mit N Einträgen anlegen", and the preposition „mit" governs
 * the dative — so the plural is „Einträgen", not the nominative „Einträge", while
 * the singular „Eintrag" is unchanged. Handing the call site a nominative count
 * to concatenate is exactly how that ungrammatical string gets shipped.
 *
 * 0 is not "Liste mit 0 Einträgen": the design switches to „Leere Liste anlegen",
 * because an empty pre-fill is a different intent, not a degenerate count.
 */
export function formatNewListLabel(count: number): string {
  if (count === 0) return "Leere Liste anlegen";
  return `Liste mit ${count} ${count === 1 ? "Eintrag" : "Einträgen"} anlegen`;
}

/**
 * "6 Artikel" — the meta line of a recipe row on the index screen (spec §5).
 *
 * Why not formatArticleCount, which produces the same string: a recipe with no lines yet must not
 * read "0 Artikel". An empty recipe is a normal intermediate state (you create it, then fill it),
 * so the zero case says so in words instead of printing a count that looks like a failure.
 */
export function formatRecipeArticleCount(count: number): string {
  if (count === 0) return "Noch keine Artikel";
  return `${count} Artikel`;
}

/**
 * The recipe-usage message — the second reason a catalog article cannot be deleted (Slice 18).
 *
 * Twin of formatUsedInLists, and shared for the same reason: the sentence is printed twice, once as
 * a note in the Katalog edit panel and once inside the ApiError the delete guard throws when a
 * recipe was created in the meantime. They must read identically.
 *
 * The dative "-n" is why this cannot just concatenate labels.plural: "in" governs the dative, and
 * German weak plurals take an extra -n there (for example "in 2 Paketen"). A plural that
 * already ends in -n or -s takes nothing ("in 3 Sets"), which is what the suffix check below does.
 * It is a heuristic over a user-chosen noun, which is the best that is possible here — and it is
 * right for the default wording, which is what almost every project will use.
 */
export function formatUsedInRecipes(count: number, labels: RecipeLabels): string {
  const noun =
    count === 1
      ? labels.singular
      : /[ns]$/i.test(labels.plural)
        ? labels.plural
        : `${labels.plural}n`;
  return `wird in ${count} ${noun} verwendet`;
}

/**
 * The sentence the apply sheet reports: „Lasagne ×2 hinzugefügt · 4 neue Einträge, 2 zusammengeführt“.
 *
 * Why the copy lives here rather than in the sheet: it carries two independent German plural rules
 * („Eintrag“/„Einträge“) and three shapes (both halves, one half, neither), which is exactly the
 * kind of thing that is cheap to test without a DOM and expensive to eyeball inside JSX. It is the
 * same reasoning that put `formatMergeMessage` next to the merge rule in Slice 17.
 *
 * Note what `merged` counts: a line that REPLAYED on a retry is reported as merged, because the
 * sentence describes the state of the list, not the number of rows this request wrote.
 */
export function formatApplyResult(
  applied: { name: string; count: number }[],
  added: number,
  merged: number,
): string {
  // „Lasagne ×2, Chili ×1“ — the multiplication sign U+00D7, not the letter x.
  const recipes = applied.map((entry) => `${entry.name} ×${entry.count}`).join(", ");

  const parts: string[] = [];
  if (added > 0) parts.push(`${added} ${added === 1 ? "neuer Eintrag" : "neue Einträge"}`);
  if (merged > 0) parts.push(`${merged} zusammengeführt`);
  // Both zero is reachable: an empty recipe, or a retry of an apply whose every line had already
  // landed as a new row. Saying nothing at all would read as a failure.
  if (parts.length === 0) parts.push("keine neuen Einträge");

  return `${recipes} hinzugefügt · ${parts.join(", ")}`;
}

/**
 * „Milch, Eier und Butter“ — a German enumeration.
 *
 * Why not names.join(", "): German (like English) replaces the last separator with „und“, and a
 * note that reads „Milch, Eier, Butter kommen schon…“ is the kind of small wrongness that makes an
 * app feel machine-written. Deliberately no Oxford comma — German does not use one.
 */
export function formatArticleEnumeration(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  const head = names.slice(0, -1);
  const last = names[names.length - 1];
  return `${head.join(", ")} und ${last}`;
}

/**
 * The new-list sheet's step-2 note: "Milch, Eier und Butter kommen schon aus den {plural} und
 * werden nicht doppelt hinzugefügt." (spec §6).
 *
 * Why the note is ADDITIVE rather than striking the chips in step 1: rewriting step 1's UI from
 * step 2 reads as the app undoing choices the user just made. The design is explicit about this.
 *
 * DELIBERATE WORDING DEVIATION from the spec's sketch, which reads „… — sie werden nicht
 * doppelt hinzugefügt.“ That works for a plural overlap and breaks for a single article
 * („Milch … sie wird“), whose gender is unknowable. „… und werden/wird nicht doppelt
 * hinzugefügt“ says the same thing in both numbers with no pronoun at all. The sketch is a
 * wireframe, not a copy contract.
 *
 * Why the sentence avoids pronouns entirely („und wird“ instead of „er/sie/es wird“): the article
 * names are free text with unknowable gender, and the recipe label is user-chosen too (ruling R7
 * of Slice 18 fixed the label as neuter, but articles have no such fallback). A construction with
 * no pronoun is correct for every noun.
 *
 * Returns "" for an empty overlap so the caller can render it unconditionally.
 */
export function formatRecipeOverlapNote(names: string[], labels: RecipeLabels): string {
  if (names.length === 0) return "";
  const verb = names.length === 1 ? "kommt" : "kommen";
  const added = names.length === 1 ? "wird" : "werden";
  // "aus den" governs the dative, so weak plurals need the extra -n (a noun that would
  // otherwise stay in nominative plural). Same heuristic as formatUsedInRecipes: a plural
  // that already ends in -n or -s stays as written ("Sets"). Always the PLURAL — the source
  // is the recipes as a set, even when a single article is named.
  const source = /[ns]$/i.test(labels.plural) ? labels.plural : `${labels.plural}n`;
  return `${formatArticleEnumeration(names)} ${verb} schon aus den ${source} und ${added} nicht doppelt hinzugefügt.`;
}

/**
 * „Liste anlegen · 15 Artikel“ — the second pane's commit button (spec §6).
 *
 * Why a second label function next to formatNewListLabel rather than a parameter: the one-pane
 * button promises „Liste mit 15 Einträgen anlegen“ (dative, counting ENTRIES), while this one
 * counts distinct ARTICLES across recipes and pre-fill (ruling R5) — two different nouns making
 * two different promises. Zero collapses to the same „Leere Liste anlegen“, because an empty list
 * is an empty list either way.
 */
export function formatNewListWithRecipesLabel(count: number): string {
  if (count === 0) return "Leere Liste anlegen";
  return `Liste anlegen · ${count} Artikel`;
}
