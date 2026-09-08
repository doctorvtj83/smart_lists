"use client";

import { InlineEdit } from "@/components/ui/InlineEdit";
import styles from "./ListTitle.module.css";

type ListTitleProps = {
  name: string;
  /** Server Action; receives the trimmed, actually-changed name. */
  renameAction: (name: string) => Promise<void>;
};

/**
 * The list name in the screen header, inline-editable.
 *
 * Unlike ProjectTitle there is no `editable` prop: list rename is member-level
 * (MVP design §6 groups it with create/complete/delete list, all ✓ for
 * Mitglied — only the PROJECT's name/deletion is owner-only), so every caller
 * who can even reach this screen may rename the list.
 *
 * Same boundary reasoning as ProjectTitle: the page is a Server Component and
 * InlineEdit needs a client callback, so this thin wrapper is where "use client"
 * starts.
 */
export function ListTitle({ name, renameAction }: ListTitleProps) {
  return (
    <span className={styles.title}>
      <InlineEdit value={name} label="Listenname" onSave={(next) => renameAction(next)} />
    </span>
  );
}
