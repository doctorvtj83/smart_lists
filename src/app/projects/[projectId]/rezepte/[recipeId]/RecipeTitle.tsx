"use client";

import { useState } from "react";
import { InlineEdit } from "@/components/ui/InlineEdit";
import type { RecipeLabels } from "@/lib/recipes/labels";
import styles from "./RecipeTitle.module.css";

type RecipeTitleProps = {
  name: string;
  labels: RecipeLabels;
  /** Server Action; returns a German inline error or null after a successful rename. */
  renameAction: (name: string) => Promise<string | null>;
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
  const [error, setError] = useState<string | null>(null);

  /**
   * Keeps the Server Action's result in this client boundary, because InlineEdit deliberately owns
   * no mutation state and can only render the error its caller passes through the `error` prop.
   */
  async function saveName(next: string): Promise<void> {
    setError(null);
    setError(await renameAction(next));
  }

  return (
    <span className={styles.title}>
      {/* The accessible name is composed, so a project that calls them "Sets" hears "Setname". */}
      <InlineEdit
        value={name}
        label={`${labels.singular}name`}
        onSave={saveName}
        error={error}
      />
    </span>
  );
}
