/**
 * The two avatar colours the design uses (accent, and a lighter accent shade).
 * Kept to exactly what the handoff shows — inventing a third would be inventing
 * design.
 */
export const AVATAR_COLORS = ["#3e63c4", "#7a8fc9"] as const;

/**
 * Picks a project's avatar colour from its name.
 *
 * Why derived instead of stored: projects have no colour column, and the design
 * shows different projects in different shades. Deriving it from the name keeps
 * the colour stable for a given project without a schema change — which matters
 * because the avatar shows up on Home, Projekte, the drawer and the switcher,
 * and a project that changed colour between screens would read as a bug.
 *
 * The hash is a small FNV-style accumulator: cheap, dependency-free and
 * deterministic. It is not a security primitive and does not need to be.
 */
export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    // charCodeAt over the raw string handles umlauts fine — we only need a
    // stable number, not a linguistically meaningful one.
    hash = (hash * 31 + name.charCodeAt(i)) % 100000;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
