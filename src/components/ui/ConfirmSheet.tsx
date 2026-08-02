"use client";

import type { ReactNode } from "react";
import { Sheet } from "./Sheet";
import styles from "./ConfirmSheet.module.css";

export type ConfirmOption = {
  /** German action label, e.g. "Nur Zugang entziehen". */
  label: string;
  /** German sentence spelling out the consequence. Strongly recommended. */
  description?: string;
  /** "danger" gets the red border and tinted surface. */
  tone: "neutral" | "danger";
  onSelect: () => void;
};

type ConfirmSheetProps = {
  open: boolean;
  onClose: () => void;
  /** German sheet title naming the target, e.g. "Zugang entziehen: anna@web.de". */
  title: string;
  /** Optional context above the options — e.g. the affected memberships. */
  children?: ReactNode;
  options: ConfirmOption[];
  cancelLabel?: string;
};

/**
 * The destructive-confirmation pattern.
 *
 * Why options instead of a yes/no dialog: the design's most consequence-heavy
 * screen (Verwaltung's two-way revoke) offers two *different* destructive
 * outcomes side by side, one reversible and one not. Modelling confirmation as a
 * list of labelled options with their consequences spelled out — rather than
 * "Sind Sie sicher?" — is what lets the user pick the right one. Everything else
 * in the app that confirms (delete project, delete list, delete entry) is the
 * same pattern with a single option.
 *
 * The description lives inside the <button>, so a screen reader announces the
 * consequence together with the action instead of leaving it as loose text the
 * user may never reach.
 */
export function ConfirmSheet({
  open,
  onClose,
  title,
  children,
  options,
  cancelLabel = "Abbrechen",
}: ConfirmSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {children}
      <div className={styles.options}>
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            className={[styles.option, styles[option.tone]].join(" ")}
            onClick={option.onSelect}
          >
            <span className={styles.optionLabel}>{option.label}</span>
            {option.description ? (
              <span className={styles.optionDescription}>{option.description}</span>
            ) : null}
          </button>
        ))}
      </div>
      <button type="button" className={styles.cancel} onClick={onClose}>
        {cancelLabel}
      </button>
    </Sheet>
  );
}
