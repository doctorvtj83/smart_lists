// Shared parsing/derivation logic for the REWE receipt backfill (Einkaufen project).
//
// WHY this exists as its own module: generate-catalog-review.ts (produces the Excel for
// human review) and execute-backfill.ts (writes the reviewed data to the DB) both need to
// group the SAME raw CSV rows into the SAME catalog-item candidates the same way — otherwise
// the row a human corrected in the spreadsheet could silently map to a different group at
// execute time. Keeping the grouping logic in one place guarantees the two scripts agree.
//
// This is a one-off admin tool (like prisma/seed.ts), not part of the running app, so it is
// allowed to reach into the app's own catalog helpers (normalizeName, compareGermanText) by
// relative import rather than duplicating the identity rule.

import { readFileSync } from "node:fs";
import { normalizeName } from "../../src/lib/catalog/normalize";
import { compareGermanText } from "../../src/lib/catalog/sort";

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

// A single line of the source CSV, in column order. Every value is the raw string from the
// file — "null" (the literal word) is how the extraction pipeline that produced this CSV
// spelled a missing value, so callers must check for it explicitly rather than trusting
// falsy-ness.
export interface RawRow {
  purchaseDate: string; // "YYYY-MM-DD" or the literal "null"
  productName: string; // the OCR'd receipt line, unnormalized
  quantity: string; // decimal string, e.g. "0.62"
  unit: string; // "kg" | "STK" | "" (no unit printed on the receipt)
  genericName: string; // the extraction pipeline's cleaned article name, or "null"
  section: string; // the store aisle/category from the receipt, or "null"
  sourceFile: string; // "Dein REWE eBon vom DD.MM.YYYY.pdf" — the fallback date source
}

// Splits one CSV line into fields, honouring double-quoted fields that themselves contain a
// comma (e.g. `"BIO JOG AKT 1,8%"`, `"PFAND 1,50 EURO"` — German decimal commas inside a
// quoted amount). A hand-rolled parser is enough here: the source file has no embedded
// newlines inside quoted fields, so line-by-line splitting is safe, and pulling in a CSV
// library for one script would be overkill.
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        // `""` inside a quoted field is an escaped literal quote (RFC 4180); a lone `"` closes the field.
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

// Reads and parses the whole receipts CSV. Assumes the fixed column order documented on
// RawRow (matches extract_receipts.csv's header) rather than reading the header row, since
// this is a one-off script over one known file shape.
export function parseReceiptsCsv(path: string): RawRow[] {
  const text = readFileSync(path, "utf-8");
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const [, ...dataLines] = lines; // drop the header row
  return dataLines.map((line) => {
    const [purchaseDate, productName, quantity, unit, genericName, section, sourceFile] =
      splitCsvLine(line);
    return { purchaseDate, productName, quantity, unit, genericName, section, sourceFile };
  });
}

// ---------------------------------------------------------------------------
// Mojibake repair
// ---------------------------------------------------------------------------

// The PDF-extraction pipeline that produced this CSV sometimes emitted UTF-8 German umlauts
// that were re-decoded as if they were single-byte Latin-1 text (classic mojibake), e.g. the
// UTF-8 bytes for "ä" (C3 A4) show up as the two characters "Ã¤". A lone "Ã" (with the
// following continuation byte dropped by the pipeline) marks a lost "ß". Order matters: the
// two-character sequences must be replaced BEFORE the catch-all lone "Ã" rule, or "Ã¤" would
// wrongly become "ßÂ¤"-ish garbage instead of "ä".
export function repairMojibake(input: string): string {
  return input
    .replace(/Ã¤/g, "ä")
    .replace(/Ã¶/g, "ö")
    .replace(/Ã¼/g, "ü")
    .replace(/Ã„/g, "Ä")
    .replace(/Ã–/g, "Ö")
    .replace(/Ãœ/g, "Ü")
    .replace(/Ã/g, "ß");
}

// Some receipt sections came through as plain ASCII transliterations (e.g. "Kaese",
// "Obst & Gemuese") rather than mojibake, because the extraction pipeline was inconsistent
// row to row. Since these become user-facing category chips in a German-language app
// (CLAUDE.md), canonicalize every spelling variant seen in the source data to one proper
// German label. Anything not in this table is returned mojibake-repaired but otherwise
// as-is, so an unexpected section never silently disappears.
const SECTION_CANON: Record<string, string> = {
  kaese: "Käse",
  "obst & gemuese": "Obst & Gemüse",
  "obst & gemüse": "Obst & Gemüse",
  getraenke: "Getränke",
  "gewuerze & oele": "Gewürze & Öle",
  tiefkuehl: "Tiefkühl",
  "snacks & suessigkeiten": "Snacks & Süßigkeiten",
  "snacks & süßigkeiten": "Snacks & Süßigkeiten",
};

export function canonicalizeSection(rawSection: string): string {
  const repaired = repairMojibake(rawSection).trim();
  return SECTION_CANON[repaired.toLowerCase()] ?? repaired;
}

// ---------------------------------------------------------------------------
// Non-article lines
// ---------------------------------------------------------------------------

// Generic names that are receipt bookkeeping, not purchasable articles — a deposit line, a
// discount, a bottle-return credit, a manual price correction. These would pollute the
// catalog (and never make sense as a shopping-list entry to re-buy), so the review sheet
// defaults them to excluded. The user can still flip a row back on if they disagree.
const NON_ARTICLE_NAMES = new Set([
  "rabatt",
  "pfand",
  "leergut mehrweg",
  "nachträgliche preiskorrektur",
]);

export function isNonArticle(repairedGenericName: string): boolean {
  return NON_ARTICLE_NAMES.has(repairedGenericName.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Date resolution
// ---------------------------------------------------------------------------

// Recovers "YYYY-MM-DD" from "Dein REWE eBon vom DD.MM.YYYY.pdf" — the fallback for the rows
// whose purchase_date column is the literal "null" (one whole receipt, 07.04.2026, has this;
// every row in it carries the same source_file, so the filename is a reliable substitute).
export function dateFromSourceFile(sourceFile: string): string {
  const match = sourceFile.match(/vom (\d{2})\.(\d{2})\.(\d{4})\.pdf$/);
  if (!match) throw new Error(`Konnte kein Datum aus Dateiname lesen: ${sourceFile}`);
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export function resolvePurchaseDate(row: RawRow): string {
  return row.purchaseDate && row.purchaseDate !== "null"
    ? row.purchaseDate
    : dateFromSourceFile(row.sourceFile);
}

// ---------------------------------------------------------------------------
// Rough German singular/plural stemmer — for the "possible duplicate" hint only
// ---------------------------------------------------------------------------

// NOT a real stemmer — just enough to catch the exact pattern this receipt data has plenty
// of (the extraction pipeline being inconsistent about "Erdbeere" vs "Erdbeeren" for the same
// real article across different receipts). Strips one trailing plural-ish suffix off the last
// word of a normalized name. False positives/negatives are expected and fine: this only
// drives a review HINT in the spreadsheet, never an automatic merge — the human decides.
export function roughGermanStem(normalizedName: string): string {
  const cleaned = normalizedName.replace(/[^a-zäöüß ]/g, "").trim();
  const words = cleaned.split(" ");
  const last = words[words.length - 1] ?? "";
  let stemmed = last;
  if (last.endsWith("en") && last.length > 4) stemmed = last.slice(0, -2);
  else if (last.endsWith("e") && last.length > 3) stemmed = last.slice(0, -1);
  else if (last.endsWith("n") && last.length > 3) stemmed = last.slice(0, -1);
  words[words.length - 1] = stemmed;
  return words.join(" ");
}

// ---------------------------------------------------------------------------
// Catalog-candidate grouping
// ---------------------------------------------------------------------------

// One candidate catalog item, derived from every raw row that shares its normalized article
// identity (same rule as CatalogItem.normalizedName — see normalizeName). This is exactly
// the unit the review spreadsheet shows one row per, and exactly the unit execute-backfill.ts
// re-derives to join the human corrections back onto the raw rows.
export interface CatalogCandidate {
  /** normalizeName(repaired generic_name) — the stable join key across both scripts/the sheet. */
  normalizedKey: string;
  /** Most frequent display-name spelling seen for this identity. */
  suggestedName: string;
  /** Most frequent (canonicalized) section seen — the category suggestion. */
  suggestedCategory: string;
  /** Every canonicalized section seen, with counts — for the human to cross-check an ambiguous case. */
  categoryBreakdown: { category: string; count: number }[];
  /** true when more than one distinct section was seen for this article. */
  categoryAmbiguous: boolean;
  /** Most frequent non-empty unit seen, or null if the article is usually unitless. */
  suggestedUnit: string | null;
  /** Total CSV rows contributing to this candidate. */
  occurrenceCount: number;
  /** Number of distinct purchase dates (≈ distinct historic lists) this article appeared on. */
  listCount: number;
  /** Distinct raw product_name spellings seen on the receipts, for traceability in the sheet. */
  rawProductNames: string[];
  /** Pre-filled reason to exclude this row from the catalog (deposit/discount/correction), or null. */
  exclusionReason: string | null;
}

function mostFrequent<T extends string>(counts: Map<T, number>): T {
  let best: T | undefined;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  // Only called with a non-empty map by this module's own logic.
  return best as T;
}

function bump<T>(map: Map<T, number>, key: T): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

// Groups every row that has a usable generic_name into catalog candidates. Rows with no
// generic_name at all ("null" — a weight-only OCR line the extraction pipeline could not
// attribute to an article) cannot become a catalog item and are returned separately so the
// caller can report them rather than silently dropping data.
export function buildCatalogCandidates(rows: RawRow[]): {
  candidates: CatalogCandidate[];
  unassignableRows: RawRow[];
} {
  const unassignableRows: RawRow[] = [];

  interface GroupAccumulator {
    nameCounts: Map<string, number>;
    sectionCounts: Map<string, number>;
    unitCounts: Map<string, number>;
    rawProductNames: Set<string>;
    dates: Set<string>;
    occurrenceCount: number;
  }
  const groups = new Map<string, GroupAccumulator>();

  for (const row of rows) {
    if (row.genericName === "null" || row.genericName.trim() === "") {
      unassignableRows.push(row);
      continue;
    }
    const repairedName = repairMojibake(row.genericName).trim();
    const key = normalizeName(repairedName);
    let group = groups.get(key);
    if (!group) {
      group = {
        nameCounts: new Map(),
        sectionCounts: new Map(),
        unitCounts: new Map(),
        rawProductNames: new Set(),
        dates: new Set(),
        occurrenceCount: 0,
      };
      groups.set(key, group);
    }
    bump(group.nameCounts, repairedName);
    if (row.section && row.section !== "null") {
      bump(group.sectionCounts, canonicalizeSection(row.section));
    }
    if (row.unit && row.unit.trim() !== "") {
      bump(group.unitCounts, row.unit.trim());
    }
    if (row.productName && row.productName !== "null") {
      group.rawProductNames.add(row.productName);
    }
    group.dates.add(resolvePurchaseDate(row));
    group.occurrenceCount++;
  }

  const candidates: CatalogCandidate[] = [];
  for (const [normalizedKey, group] of groups) {
    const suggestedName = mostFrequent(group.nameCounts);
    const categoryBreakdown = [...group.sectionCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
    const suggestedCategory = categoryBreakdown[0]?.category ?? "";
    candidates.push({
      normalizedKey,
      suggestedName,
      suggestedCategory,
      categoryBreakdown,
      categoryAmbiguous: categoryBreakdown.length > 1,
      suggestedUnit: group.unitCounts.size > 0 ? mostFrequent(group.unitCounts) : null,
      occurrenceCount: group.occurrenceCount,
      listCount: group.dates.size,
      rawProductNames: [...group.rawProductNames].sort(compareGermanText),
      exclusionReason: isNonArticle(suggestedName)
        ? "Kein Artikel (Pfand/Rabatt/Korrektur o.ä.)"
        : null,
    });
  }

  candidates.sort((a, b) => compareGermanText(a.suggestedName, b.suggestedName));
  return { candidates, unassignableRows };
}

// Attaches a "possible duplicate" hint to candidates whose rough stem collides with another
// candidate's stem (see roughGermanStem) — e.g. "Erdbeere" vs "Erdbeeren". Returns a map from
// normalizedKey to the list of OTHER candidates' suggested names sharing its stem, only for
// keys that actually collide with something.
export function findPossibleDuplicates(candidates: CatalogCandidate[]): Map<string, string[]> {
  const byStem = new Map<string, CatalogCandidate[]>();
  for (const candidate of candidates) {
    const stem = roughGermanStem(candidate.normalizedKey);
    const bucket = byStem.get(stem);
    if (bucket) bucket.push(candidate);
    else byStem.set(stem, [candidate]);
  }
  const result = new Map<string, string[]>();
  for (const bucket of byStem.values()) {
    if (bucket.length < 2) continue;
    for (const candidate of bucket) {
      result.set(
        candidate.normalizedKey,
        bucket.filter((c) => c !== candidate).map((c) => c.suggestedName),
      );
    }
  }
  return result;
}
