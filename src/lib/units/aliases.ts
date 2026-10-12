/**
 * Shared unit vocabulary for Smart Lists.
 *
 * WHY this module exists: the entry-input parser and the scale converter (Slice 20)
 * both need the same alias → canonical display mapping. A single table here prevents
 * the two call sites from drifting apart when we add household spellings.
 */

/**
 * Lowercase alias → canonical display unit.
 *
 * The values are what the entry row will print („1,5 l"), so they carry the
 * spelling and case the design asks for; the keys are every spelling a German
 * household actually types. Common plurals are listed explicitly rather than
 * stemmed: a lookup table is obvious and cheap, while a stemmer would guess.
 */
export const BASE_UNIT_ALIASES: Record<string, string> = {
  // Weight
  g: "g",
  gramm: "g",
  kg: "kg",
  kilo: "kg",
  kilogramm: "kg",
  pfund: "Pfund",
  // Volume
  ml: "ml",
  milliliter: "ml",
  cl: "cl",
  zentiliter: "cl",
  dl: "dl",
  deziliter: "dl",
  l: "l",
  liter: "l",
  // Packaging and count
  stk: "Stk",
  stück: "Stk",
  stueck: "Stk",
  pck: "Packung",
  pkg: "Packung",
  packung: "Packung",
  packungen: "Packung",
  dose: "Dose",
  dosen: "Dose",
  flasche: "Flasche",
  flaschen: "Flasche",
  glas: "Glas",
  gläser: "Glas",
  becher: "Becher",
  bund: "Bund",
  beutel: "Beutel",
  tüte: "Tüte",
  tüten: "Tüte",
  rolle: "Rolle",
  rollen: "Rolle",
  tafel: "Tafel",
  tafeln: "Tafel",
  scheibe: "Scheibe",
  scheiben: "Scheibe",
  kiste: "Kiste",
  kisten: "Kiste",
  karton: "Karton",
  // Cooking
  tl: "TL",
  el: "EL",
  prise: "Prise",
  // Length
  mm: "mm",
  millimeter: "mm",
  cm: "cm",
  zentimeter: "cm",
  m: "m",
  meter: "m",
};

/**
 * Resolves a raw unit string to its canonical display form using only the base
 * vocabulary (no per-project catalog units).
 *
 * WHY trim then lowercase: callers may pass catalog free text with stray spaces;
 * aliases are keyed lowercase while values preserve design spelling („Pfund").
 *
 * WHY Object.hasOwn: a plain `BASE_UNIT_ALIASES[key]` would inherit
 * Object.prototype names like "constructor" and return a function as the unit.
 */
export function canonicalUnit(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  return Object.hasOwn(BASE_UNIT_ALIASES, key) ? BASE_UNIT_ALIASES[key] : null;
}
