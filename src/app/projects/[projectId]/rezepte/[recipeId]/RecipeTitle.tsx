"use client";

import { InlineEdit } from "@/components/ui/InlineEdit";
import type { RecipeLabels } from "@/lib/recipes/labels";
import styles from "./RecipeTitle.module.css";

type RecipeTitleProps = {
  name: string;
  labels: RecipeLabels;
  /** Server Action; receives the trimmed, actually-changed name. */
  renameAction: (name: string) => Promise<void>;
};

/**
 * The recipe name in the screen header, inline-editable — the twin of ListTitle.
 *
 * Member-level like the list's name, and for the same reason: recipes are project CONTENT, and
 * every member who can reach this screen may edit it. Only the project's own name is owner-only.
 *
 * Same boundary reasoning as ListTitle: the page is a Server Component and InlineEdit needs a
 * client callback, so this thin wrapper is where "use client" starts.
 *
 * Ruling R8: tapping the title IS the rename affordance. InlineEdit exposes no way to be opened
 * from elsewhere, and ListMenu has no rename entry either — so RecipeMenu does not pretend to.
 */
export function RecipeTitle({ name, labels, renameAction }: RecipeTitleProps) {
  return (
    <span className={styles.title}>
      {/* The accessible name is composed, so a project that calls them "Sets" hears "Setname". */}
      <InlineEdit
        value={name}
        label={`${labels.singular}name`}
        onSave={(next) => renameAction(next)}
      />
    </span>
  );
}
