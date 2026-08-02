import { compareGermanText } from "@/lib/catalog/sort";

/**
 * The category vocabulary of the list screen.
 *
 * Category is a nullable free-text field on ListItem. The UI, however, needs a
 * total function: every entry belongs to exactly one visible bucket, and the
 * bucket for "no category" is a German label the user can tap like any other.
 * These helpers are the one place that translation happens, so the filter chips,
 * the „Alle" grouping and the entry sheet can never disagree about what a
 * category is.
 *
 * All pure and synchronous: they take already-loaded entries, so the client
 * component can call them on every render and they are testable without a DB.
 */

/** The filter chip that shows everything. Never a real category value. */
export const ALL_CATEGORIES_LABEL = "Alle";

/** The bucket for entries whose category is null/blank. Always sorts last. */
export const UNCATEGORIZED_LABEL = "Ohne Kategorie";

/** The minimum an item must have for these helpers to bucket it. */
export interface CategorizedItem {
  category: string | null;
}

/**
 * The visible bucket for one entry: its trimmed category, or the German
 * placeholder. This is what makes „Ohne Kategorie" behave like a category
 * everywhere else in the screen without ever being stored as one.
 */
export function categoryLabel(category: string | null): string {
  const trimmed = category?.trim();
  return trimmed ? trimmed : UNCATEGORIZED_LABEL;
}

/**
 * The filter chip row, in display order (handoff §10): „Alle" first, real
 * categories alphabetically under German rules, „Ohne Kategorie" always last.
 *
 * `active` is passed in so the currently selected chip survives its category
 * going empty — the design's explicit rule ("aktiver Chip überlebt das
 * Leerwerden"). It is inserted before sorting, so it keeps its alphabetical
 * position instead of being appended at the end; `ChipTabs` has a fallback that
 * appends an unknown active value, and this is what stops that fallback from
 * ever firing with a visibly wrong order.
 */
export function categoryChipOptions(
  items: CategorizedItem[],
  active: string = ALL_CATEGORIES_LABEL,
): string[] {
  const present = new Set(items.map((item) => categoryLabel(item.category)));
  // "Alle" is not a bucket, so only a real active chip is worth preserving.
  if (active !== ALL_CATEGORIES_LABEL) present.add(active);

  const named = [...present]
    .filter((category) => category !== UNCATEGORIZED_LABEL)
    .sort(compareGermanText);

  const options = [ALL_CATEGORIES_LABEL, ...named];
  if (present.has(UNCATEGORIZED_LABEL)) options.push(UNCATEGORIZED_LABEL);
  return options;
}

/** One rendered section in the „Alle" view: its label and the entries under it. */
export interface CategoryGroup<T> {
  category: string;
  items: T[];
}

/**
 * The „Alle" view's sections. Same order as the chips (minus „Alle" itself), and
 * empty sections are dropped so a category never shows an empty heading.
 *
 * The entries keep their incoming order inside a group — that is sortIndex, the
 * single source of ordering truth (getListWithItems orders by it). Grouping is
 * purely a render-time view, exactly as it was before this slice.
 */
export function groupItemsByCategory<T extends CategorizedItem>(items: T[]): CategoryGroup<T>[] {
  return categoryChipOptions(items)
    .filter((category) => category !== ALL_CATEGORIES_LABEL)
    .map((category) => ({
      category,
      items: items.filter((item) => categoryLabel(item.category) === category),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Every category the entry sheet offers as a chip: the project's catalog
 * defaults unioned with the categories currently on this list.
 *
 * WHY both sources: the catalog is the project's memory (a category the user set
 * months ago on another list must still be one tap away), while the current list
 * may hold a category typed just now that has not flowed back yet. The
 * placeholder is deliberately absent — the sheet clears a category by tapping the
 * selected chip off, not by picking „Ohne Kategorie".
 */
export function knownCategories(
  catalogDefaults: (string | null)[],
  itemCategories: (string | null)[],
): string[] {
  const categories = new Set<string>();
  for (const value of [...catalogDefaults, ...itemCategories]) {
    const trimmed = value?.trim();
    if (trimmed) categories.add(trimmed);
  }
  return [...categories].sort(compareGermanText);
}
