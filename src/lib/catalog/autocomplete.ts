import { normalizeName } from "./normalize";

/**
 * What the trailing entry row's dropdown offers for a typed prefix
 * (handoff §10: "Autocomplete-Dropdown über der Zeile").
 *
 * WHY this filters in the browser instead of calling GET /catalog per keystroke:
 * the screen already has the project's whole catalog as a prop (the page reads it
 * with CATALOG_DATALIST_LIMIT), a household catalog is at most a few hundred
 * articles, and a request per keystroke on a phone is the one thing this row
 * cannot afford. The server endpoint stays for any future caller.
 *
 * SLICE 8 AMENDMENT: the premise above changed. The screens no longer receive
 * the catalog as a prop — useCatalogSearch fetches a debounced page of at most
 * CATALOG_SEARCH_LIMIT matches per keystroke, and this function now ranks THAT
 * page. Everything below is unchanged and still pure; only the provenance of
 * `articles` moved. Two consequences worth knowing: the substring rule below is
 * why searchCatalog had to switch from `startsWith` to `contains` (otherwise the
 * server would pre-filter away the very matches this function looks for), and if
 * the server ever truncates at the limit, the `exists` check can offer a
 * „neu anlegen" row for an article that does exist — harmless, because
 * getOrCreateCatalogItem is idempotent on the normalized name and simply finds it.
 *
 * WHY substring matching while `searchCatalog` uses a prefix: they answer
 * different questions. searchCatalog pages the catalog in the database and must
 * use an indexable prefix; this function ranks an already-loaded array, where
 * "milch" finding "Buttermilch" is exactly what the design's dropdown shows.
 * (`CatalogBrowser`'s search made the same call for the same reason.)
 */

/** How many articles the dropdown shows. Three, per the prototype. */
export const AUTOCOMPLETE_LIMIT = 3;

/** The catalog subset this needs — a lean shape so callers can pass anything. */
export interface AutocompleteArticle {
  id: string;
  name: string;
  defaultCategory: string | null;
}

/** One dropdown row: the article name plus its muted sub-label. */
export interface AutocompleteOption {
  id: string;
  name: string;
  /** "· Molkerei", or "" when the article has no default category. */
  hint: string;
}

export interface AutocompleteResult {
  options: AutocompleteOption[];
  /**
   * The name for the „…“ neu anlegen row, or null when the typed text already
   * names an existing article (or the field is empty).
   */
  createName: string | null;
}

/**
 * Pure: same catalog + same query → same dropdown. Called on every keystroke.
 */
export function buildAutocomplete(
  articles: AutocompleteArticle[],
  query: string,
  limit: number = AUTOCOMPLETE_LIMIT,
): AutocompleteResult {
  // normalizeName is the catalog's identity rule (lowercase + trim + collapse
  // spaces). Reusing it is what makes the dropdown agree with what the server
  // will actually resolve the typed name to.
  const needle = normalizeName(query);
  // Nothing typed yet: the design shows no dropdown at all, not the whole catalog.
  if (!needle) return { options: [], createName: null };

  const matches = articles.filter((article) => normalizeName(article.name).includes(needle));

  const options = matches.slice(0, limit).map((article) => ({
    id: article.id,
    name: article.name,
    // The middle dot is the same separator formatArticleDefaults uses.
    hint: article.defaultCategory ? `· ${article.defaultCategory}` : "",
  }));

  // An EXACT normalized hit means picking a suggestion and "creating" would end
  // up at the same catalog row, so the create affordance would be a lie.
  const exists = matches.some((article) => normalizeName(article.name) === needle);

  return {
    options,
    // Presented with the same cleanup getOrCreateCatalogItem applies to the
    // display name, so the row shows the name the user will actually get.
    createName: exists ? null : query.trim().replace(/\s+/g, " "),
  };
}
