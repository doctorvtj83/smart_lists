// Normalizes an article name into its identity key (MVP design §4.4).
// MVP rule: lowercase + trim + collapse repeated whitespace. CatalogItem.normalizedName is unique
// per project on exactly this value, so "Milch", " milch " and "MILCH" are ONE article.
// Deliberately separate from normalizeEmail (src/lib/auth/normalize.ts): emails do not collapse
// inner spaces. Phase 2 may extend this (singular/synonyms) without changing the model.
export function normalizeName(name: string): string {
  // \s+ also collapses tabs/newlines pasted from other apps, not just double spaces.
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
