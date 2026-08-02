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
