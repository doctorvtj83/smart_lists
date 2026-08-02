"use client";

import { InlineEdit } from "@/components/ui/InlineEdit";
import styles from "./ProjectTitle.module.css";

type ProjectTitleProps = {
  name: string;
  /** true only for the owner — a member sees plain text (handoff screen 3e). */
  editable: boolean;
  /** Server Action; receives the trimmed, actually-changed name. */
  renameAction: (name: string) => Promise<void>;
};

/**
 * The project name in the screen header, inline-editable for the owner.
 *
 * Why a wrapper around InlineEdit rather than using it directly in the page:
 * the page is a Server Component, and InlineEdit needs a client callback. This
 * component is the boundary — it holds no state of its own, it only forwards.
 *
 * InlineEdit already decides what "no change" means (trim + compare), so an
 * unchanged rename never reaches the server and never becomes a sync delta for
 * the other members.
 */
export function ProjectTitle({ name, editable, renameAction }: ProjectTitleProps) {
  return (
    <span className={styles.title}>
      <InlineEdit
        value={name}
        label="Projektname"
        editable={editable}
        onSave={(next) => renameAction(next)}
      />
    </span>
  );
}
