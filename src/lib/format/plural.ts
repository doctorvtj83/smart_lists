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
