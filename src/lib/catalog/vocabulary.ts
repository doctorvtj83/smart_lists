import type { PrismaClient } from "@prisma/client";
import { compareGermanText } from "./sort";

/**
 * The two short string vocabularies a list screen needs from its catalog:
 * every default category (the entry sheet's chips) and every default unit (the
 * quantity parser's unit lookup, Slice 15).
 */
export interface CatalogVocabulary {
  categories: string[];
  units: string[];
}

/**
 * Reads a project's category and unit vocabulary — NOT its articles.
 *
 * Why it exists: before Slice 8 the list page shipped up to 1000 whole catalog
 * rows to the browser purely so three client-side helpers could each pull one
 * field out of them. Once the autocomplete dropdown fetches per keystroke
 * (useCatalogSearch), that payload has no remaining reader — but the unit lookup
 * and the category chips still need their fields. This turns a few hundred
 * kilobytes of rows into two arrays of a handful of strings.
 *
 * Pattern: `distinct` in the query rather than a Set in JS. The database is
 * already scanning these rows; making it collapse duplicates is free, and it
 * keeps the transferred row count proportional to the vocabulary, not the catalog.
 */
export async function getCatalogVocabulary(
  db: PrismaClient,
  projectId: string,
): Promise<CatalogVocabulary> {
  // Two `distinct` reads rather than one full-row read: each returns at most a
  // few dozen rows of a single column.
  const [categoryRows, unitRows] = await Promise.all([
    db.catalogItem.findMany({
      where: { projectId, defaultCategory: { not: null } },
      select: { defaultCategory: true },
      distinct: ["defaultCategory"],
    }),
    db.catalogItem.findMany({
      where: { projectId, defaultUnit: { not: null } },
      select: { defaultUnit: true },
      distinct: ["defaultUnit"],
    }),
  ]);

  // The `not: null` filters above already exclude nulls; the non-null assertions
  // below are narrowing for TypeScript, which cannot see through a Prisma filter.
  // Sorting happens in JS with the German comparator for the same reason
  // compareArticleNames exists: Postgres would order under its own collation and
  // put "Äpfel & Co" after "Zutaten".
  return {
    categories: categoryRows
      .map((row) => row.defaultCategory!)
      .sort(compareGermanText),
    units: unitRows.map((row) => row.defaultUnit!).sort(compareGermanText),
  };
}
