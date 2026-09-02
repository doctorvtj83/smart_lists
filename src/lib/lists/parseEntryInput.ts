import { parseGermanDecimal } from "@/lib/format/quantity";

/**
 * The trailing entry row's quantity heuristic (handoff §10: „Mengen-Parsing
 * ‚1,5 l Milch' / ‚3 Joghurt': führende Zahl + bekannte Einheit werden in
 * Menge/Einheit gelöst, der Katalog bekommt nur den Artikelnamen").
 *
 * WHY a pure function with the unit vocabulary passed IN rather than a module
 * that reads the catalog itself: the vocabulary is per-project (ruling 2), but
 * the splitting rule is not. Keeping the DB read at the caller makes every rule
 * below testable as a table without a database, and lets the client component
 * re-use the exact same rule for its dropdown query (Task 3).
 *
 * WHY conservative (ruling 4): this heuristic runs on EVERY add, and a wrong
 * split silently renames the user's article. Every ambiguous case therefore
 * falls back to "the whole string is the name", which is never wrong, only
 * unhelpful — the user can still set Menge/Einheit in the entry sheet.
 */

/**
 * Lowercase alias → canonical display unit.
 *
 * The values are what the entry row will print („1,5 l"), so they carry the
 * spelling and case the design asks for; the keys are every spelling a German
 * household actually types. Common plurals are listed explicitly rather than
 * stemmed: a lookup table is obvious and cheap, while a stemmer would guess.
 */
const BASE_UNIT_ALIASES: Record<string, string> = {
  // Weight
  g: "g",
  gramm: "g",
  kg: "kg",
  kilo: "kg",
  kilogramm: "kg",
  // Volume
  ml: "ml",
  milliliter: "ml",
  cl: "cl",
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
  m: "m",
  cm: "cm",
};

/** Lowercase alias → the unit as it should be stored and displayed. */
export type UnitLookup = Record<string, string>;

/**
 * The unit vocabulary for ONE project: the base list above unioned with every
 * `defaultUnit` the project's catalog already uses (ruling 2).
 *
 * WHY the project's own units join in: the catalog is the project's memory
 * (MVP design §4.4). A household that has been writing „Kiste" for months has
 * already taught the app that word, and the parser should not need a code
 * change to hear it.
 *
 * WHY the base list is spread LAST, i.e. wins a collision: a project whose
 * catalog holds „Liter" must still render the design's „1,5 l" (handoff §2).
 * Project units therefore only ever ADD keys, they never re-spell a known one.
 */
export function buildUnitLookup(catalogUnits: (string | null)[]): UnitLookup {
  const fromCatalog: UnitLookup = {};
  for (const raw of catalogUnits) {
    // The column is nullable free text, so blanks and stray spaces are real.
    const trimmed = raw?.trim();
    if (trimmed) fromCatalog[trimmed.toLowerCase()] = trimmed;
  }
  return { ...fromCatalog, ...BASE_UNIT_ALIASES };
}

/**
 * What the typed text resolves to. `name` is the only part that can create a
 * catalog ARTICLE — the quantity never reaches the catalog at all, and the unit
 * only ever updates an existing article's default (handoff §10).
 */
export interface ParsedEntryInput {
  quantity: number | null;
  unit: string | null;
  /** The article name. Trimmed and space-collapsed, never empty unless the input was. */
  name: string;
}

/**
 * A leading number, the exact whitespace gap after it, and the remainder.
 *
 * The lookahead is the load-bearing part: it forbids another digit, comma or dot
 * right after the number, so „1,5,5 Milch" fails to match instead of yielding a
 * quantity of 1,5 and an article named „,5 Milch". Capturing `\s*` separately
 * preserves whether the next token was glued to the number; only a known unit
 * may safely occupy that position, as in „500g Mehl".
 */
const LEADING_NUMBER = /^(\d+(?:[.,]\d+)?)(\s*)(?=[^\s\d.,])(.*)$/;

/**
 * Splits typed text into quantity, unit and article name.
 *
 * Never throws and never returns an empty name for a non-empty input: every
 * refusal returns the cleaned-up original as the name, which is exactly what the
 * row did before this slice existed.
 */
export function parseEntryInput(raw: string, units: UnitLookup): ParsedEntryInput {
  // Same cleanup the catalog applies to a display name (normalizeName's visible
  // half), so the name this returns is already the one the catalog will store.
  const text = raw.trim().replace(/\s+/g, " ");
  // The "refused" answer, built once: every early return below is this value.
  const unparsed: ParsedEntryInput = { quantity: null, unit: null, name: text };

  const match = LEADING_NUMBER.exec(text);
  if (!match) return unparsed;
  const [, numberText, gap, rest] = match;

  // parseGermanDecimal is the SAME reader the entry sheet's MENGE field uses, so
  // „1,5" means one-and-a-half in both places (DRY, and no second comma rule).
  const quantity = parseGermanDecimal(numberText);
  // `applyOperation`'s assertValidQuantity rejects <= 0 with a German message.
  // Refusing here instead means „0 Ahnung" becomes an article, not an error.
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) return unparsed;
  // „3" alone: a number is not an entry, and an empty name would be rejected
  // downstream anyway. The user most likely has not finished typing.
  if (!rest) return unparsed;

  // The unit can only be the FIRST token of the remainder — „1,5 Milch l" is not
  // a thing anyone types, and scanning further would invite false positives.
  const [firstToken, ...others] = rest.split(" ");
  const unitKey = firstToken.toLowerCase();
  // Own-property check only: plain `units[key]` would inherit Object.prototype
  // names like "constructor" and yield a function as the unit string.
  const unit = Object.hasOwn(units, unitKey) ? units[unitKey] : null;

  // A suffix glued directly to the number is safe only when its first token is
  // a known unit. Otherwise accepting it would silently shred real names such
  // as „6er Pack Bier" or punctuation-led text such as „1,5% Milch". This also
  // deliberately refuses „2x Milch": `x` is not part of the supported unit
  // vocabulary, so the conservative invariant keeps the whole input as a name.
  if (gap === "" && unit === null) return unparsed;

  // No known unit → a bare count („3 Joghurt"). The rest is the article name.
  if (unit === null) return { quantity, unit: null, name: rest };

  const name = others.join(" ");
  // „3 l": the unit consumed everything, so there is no article left to name.
  // Refusing entirely is better than creating an article called „l".
  if (!name) return unparsed;

  return { quantity, unit, name };
}
