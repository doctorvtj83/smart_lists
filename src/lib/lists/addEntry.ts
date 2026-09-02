import type { List, ListItem, PrismaClient } from "@prisma/client";
import { normalizeName } from "@/lib/catalog/normalize";
import { UNCATEGORIZED_LABEL } from "./categories";
import { applyOperation } from "./operations";
import { buildUnitLookup, parseEntryInput } from "./parseEntryInput";

/**
 * The trailing entry row's whole server-side meaning, in one function.
 *
 * The row itself only knows a name and which chip is active. Turning that into
 * an `add_item` operation involves three decisions the UI must not make on its
 * own, because all depend on catalog state:
 *
 *  1. WHICH CATEGORY the entry gets (handoff §10: the active chip overrides the
 *     catalog default; „Alle" inherits it).
 *  2. WHETHER THE ENTRY SHEET MUST OPEN — the design's „Neuer, unbekannter
 *     Artikel ohne Kategorie → Eintrag-Sheet öffnet sich direkt". "Unbekannt"
 *     has to be read BEFORE the add, because add_item creates the article as a
 *     side effect and afterwards everything looks known.
 *  3. HOW LEADING QUANTITY TEXT IS SPLIT — the parser needs both the project's
 *     unit vocabulary and a raw-name catalog escape hatch, so the server remains
 *     the single source of truth for the entry and the catalog article name.
 *
 * Deliberately a thin wrapper around `applyOperation` rather than its own write:
 * the operations funnel stays the only way entries are created, so idempotent
 * replay, catalog get-or-create and flow-back all still apply (MVP design §4.5).
 */

export interface AddEntryFromRowInput {
  /** Client-generated UUID — the entry's stable identity (MVP design §3). */
  itemId: string;
  /**
   * Exactly what the user typed. It may carry a leading quantity and unit,
   * which this function resolves so the catalog only ever receives the NAME.
   */
  name: string;
  /**
   * The active filter chip, or `null` for „Alle". `UNCATEGORIZED_LABEL` means the
   * user is filtered to the uncategorized bucket and wants the entry to stay
   * there — which is an explicit "no category", not "inherit".
   */
  activeCategory: string | null;
}

export interface AddEntryFromRowResult {
  item: ListItem;
  /** The cue for the UI to open the entry sheet on the category chips. */
  needsCategory: boolean;
}

export async function addEntryFromRow(
  db: PrismaClient,
  list: List,
  input: AddEntryFromRowInput,
): Promise<AddEntryFromRowResult> {
  const rawNormalized = normalizeName(input.name);

  // Two independent reads → Promise.all: the add path runs on a phone, so this
  // pays one round-trip of latency rather than waiting for two sequential query
  // round-trips. Prisma still executes two concurrent database queries.
  const [rawArticle, catalogUnits] = await Promise.all([
    // The RAW text may itself name an article („7 Zwerge Bier"). Reading this
    // BEFORE anything else serves two purposes: it is the parser's escape hatch,
    // and it is the "was this article known?" answer add_item would destroy by
    // creating the article as a side effect.
    rawNormalized
      ? db.catalogItem.findUnique({
          where: { projectId_normalizedName: { projectId: list.projectId, normalizedName: rawNormalized } },
        })
      : null,
    // The project's own unit vocabulary (Slice 15 ruling 2). `distinct` keeps
    // this proportional to the number of DIFFERENT units, not to catalog size.
    db.catalogItem.findMany({
      where: { projectId: list.projectId, defaultUnit: { not: null } },
      select: { defaultUnit: true },
      distinct: ["defaultUnit"],
    }),
  ]);

  // ESCAPE HATCH: if the raw text already names an article, the user is adding
  // THAT article — parsing it would shred „7 Zwerge Bier" into 7 × „Zwerge Bier"
  // and quietly split the project's catalog in two.
  const parsed = rawArticle
    ? { quantity: null, unit: null, name: input.name }
    : parseEntryInput(input.name, buildUnitLookup(catalogUnits.map((row) => row.defaultUnit)));

  // The article that decides `needsCategory` is the one for the EFFECTIVE name.
  // When the parser changed nothing, the lookup above already answered this —
  // re-querying the identical key would be a wasted round-trip on the hot path.
  const parsedNormalized = normalizeName(parsed.name);
  const knownArticle =
    rawArticle ??
    (parsedNormalized === rawNormalized || !parsedNormalized
      ? null
      : await db.catalogItem.findUnique({
          where: { projectId_normalizedName: { projectId: list.projectId, normalizedName: parsedNormalized } },
        }));

  // The three-way category rule. `undefined` is meaningful in add_item: it means
  // "not supplied", which is what makes the entry inherit the catalog default.
  const category =
    input.activeCategory === null
      ? undefined
      : input.activeCategory === UNCATEGORIZED_LABEL
        ? null
        : input.activeCategory;

  const item = await applyOperation(db, list, {
    op: "add_item",
    itemId: input.itemId,
    // ONLY the article name reaches the catalog — the rule this slice exists to
    // preserve. An empty name still travels: getOrCreateCatalogItem owns that
    // error („Name darf nicht leer sein"), and duplicating it here would drift.
    name: parsed.name,
    // `undefined` = "not supplied" → inherit the catalog default. `null` from the
    // parser means "found nothing", which is the same thing, so both collapse to
    // undefined rather than to an explicit clear.
    quantity: parsed.quantity ?? undefined,
    // A parsed unit is passed as an ORDINARY explicit unit, so Slice 4's
    // flow-back applies and the project learns that Milch comes in litres
    // (ruling 3). The parser only ever emits a unit from the curated list or the
    // project's own vocabulary, so this is a recognised word, not a guessed one.
    unit: parsed.unit ?? undefined,
    category,
  });

  // applyOperation returns null only for remove_item. Asserting it loudly beats
  // a non-null assertion, which would hide a future contract change.
  if (!item) throw new Error("add_item must return the created entry");

  return {
    item,
    // Both halves matter: a KNOWN article without a category is a choice the user
    // already made, and a new article that inherited a chip needs no prompt.
    needsCategory: knownArticle === null && item.category === null,
  };
}
