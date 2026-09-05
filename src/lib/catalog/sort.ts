// The ONE ordering rule for article display names (MVP design §3.1 article identity).
//
// WHY a shared module instead of an inline sort at each call site: the app renders article names in
// several places (the Favoriten section, the suggestion set, a pre-filled list), and they are meant
// to look like the same list to the same user. Two of them previously disagreed — computeSuggestions
// sorted in JS with localeCompare("de") while listFavorites sorted in Postgres under the database's
// collation — so umlauts could land in different positions in the two lists. Making the rule a named
// export means the next article list added to the app inherits the agreed order for free.

// The product is German (in-app strings are German, CLAUDE.md), so article names sort under German
// rules: "Äpfel" belongs next to "Apfel", not after "Zucker" where a code-point sort puts it.
export const ARTICLE_NAME_LOCALE = "de";

// The German collation rule itself, for any user-visible text this app sorts.
//
// WHY it was pulled out of compareArticleNames: Slice 12 sorts CATEGORY names
// ("Äpfel & Co" before "Molkerei") and the same umlaut rule has to apply. Two
// comparators would be two places to get "Ä" wrong; one named rule with a
// domain-specific alias keeps the vocabulary while sharing the behaviour.
export function compareGermanText(a: string, b: string): number {
  return a.localeCompare(b, ARTICLE_NAME_LOCALE);
}

// Comparator for Array.prototype.sort over article DISPLAY names (CatalogItem.name — never
// normalizedName, which is a lowercase identity key and not meant for humans).
//
// NOTE (updated in Slice 8): searchCatalog now DOES use this comparator. It previously kept Postgres'
// `orderBy: { name: "asc" }` with `take: limit` in the query, which meant a JS sort afterwards would
// only reorder an already-truncated page — and could change WHICH articles survived the cut. Slice 8
// removed the SQL `take` and moved both the sort and the cut into JS, in that order, which is exactly
// the fix this note asked for. Any new article list must still use this comparator; there is no longer
// an exception.
export function compareArticleNames(a: string, b: string): number {
  return compareGermanText(a, b);
}
