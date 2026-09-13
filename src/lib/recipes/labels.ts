/**
 * The ONE place the recipes feature's German wording is composed (spec §4).
 *
 * Why a helper and not string literals at the call sites: the feature is NAMED BY THE PROJECT.
 * "Rezept/Rezepte" is only the default — a packing project calls them "Sets", a workshop project
 * "Pakete". Every screen therefore has to ask the project what to call it, and the rule that makes
 * that survive review is absolute: NO German string anywhere in the codebase hardcodes "Rezept"
 * outside this module's two defaults.
 *
 * Why the labels are stored as a pair rather than derived: German plurals are not derivable
 * ("Set" -> "Sets", "Paket" -> "Pakete", "Rezept" -> "Rezepte"), so the project supplies both.
 *
 * Known limitation, accepted by the design (ruling R7): the composed phrases fix the grammatical
 * gender as NEUTER ("Neues Rezept", "Ein Rezept ..."). Gender cannot be derived from free text and
 * the default label is neuter; a project that picks a feminine noun gets "Neues Vorlage". Building
 * a gender field for a wording nobody has asked for would be worse than the flaw.
 */

/** The default wording, also what the settings form pre-fills. */
export const DEFAULT_RECIPE_LABEL_SINGULAR = "Rezept";
export const DEFAULT_RECIPE_LABEL_PLURAL = "Rezepte";

/**
 * The two columns this needs off a project row.
 *
 * Structural, not `Project`: any row with these two fields satisfies it, so the tests can pass a
 * literal and a `select`ed subset works without a cast.
 */
export interface RecipeLabelSource {
  recipeLabelSingular: string;
  recipeLabelPlural: string;
}

/** Every phrase the feature renders, already composed. */
export interface RecipeLabels {
  /** "Rezept" — the bare singular, for a sheet title or a composed sentence. */
  singular: string;
  /** "Rezepte" — the bare plural. */
  plural: string;
  /** "Rezepte" — the drawer/sidebar entry (Task 9). */
  navEntry: string;
  /** "Neues Rezept" — the index screen's create button (Task 10). */
  newOne: string;
  /** "Rezept hinzufügen" — a list's ⋮ entry (Slice 19). */
  addToList: string;
  /** "Rezept aus Liste anlegen" — a completed list's ⋮ entry (Slice 19). */
  fromList: string;
  /** "Rezept umbenennen" — the detail screen's ⋮ entry (Task 11). */
  renameOne: string;
  /** "Rezept löschen" — the detail screen's ⋮ entry (Task 11). */
  deleteOne: string;
}

/**
 * Reads one stored label, falling back to the default when the column is blank.
 *
 * The columns are free text with a NOT NULL default, so a blank can only arrive via a seed, an
 * import or a future bug — but "Neues " on a button is the kind of breakage nobody reports, so the
 * cheapest possible guard is worth having here rather than in each of eight phrases.
 */
function resolveLabel(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  return trimmed === "" ? fallback : trimmed;
}

/**
 * Composes every user-facing recipe phrase from the project's own singular/plural pair.
 *
 * Pure by design: it takes the two columns and returns strings, so the settings screen, the nav,
 * both recipe screens and (in Slice 19) the list menus all read from one tested source. The
 * consequence the design cares about: renaming the feature is a settings edit, never a migration.
 */
export function recipeLabels(source: RecipeLabelSource): RecipeLabels {
  const singular = resolveLabel(source.recipeLabelSingular, DEFAULT_RECIPE_LABEL_SINGULAR);
  const plural = resolveLabel(source.recipeLabelPlural, DEFAULT_RECIPE_LABEL_PLURAL);

  return {
    singular,
    plural,
    navEntry: plural,
    newOne: `Neues ${singular}`,
    addToList: `${singular} hinzufügen`,
    fromList: `${singular} aus Liste anlegen`,
    renameOne: `${singular} umbenennen`,
    deleteOne: `${singular} löschen`,
  };
}
