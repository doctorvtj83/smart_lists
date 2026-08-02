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
// NOTE: searchCatalog deliberately does NOT use this and keeps its Postgres `orderBy: { name: "asc" }`.
// It applies `take: limit` in the query, so sorting in JS afterwards would only reorder an
// already-truncated page — and worse, it could change WHICH articles survive the cut. Fixing that
// properly means moving the cut client-side (a Slice 8 concern, when the datalist is replaced by a
// fetch-on-keystroke dropdown). Do not "unify" it by adding this comparator there.
export function compareArticleNames(a: string, b: string): number {
  return compareGermanText(a, b);
}
