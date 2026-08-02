"use client";

import { useId, useRef, useState } from "react";
import { FieldError } from "./FieldError";
import styles from "./InlineEdit.module.css";

type InlineEditProps = {
  /** The saved value — the component treats this as the source of truth. */
  value: string;
  /** Called only with a non-empty, actually-changed value. */
  onSave: (next: string) => void | Promise<void>;
  /** German accessible name for the input, e.g. "Projektname". */
  label: string;
  /** false → plain text, no affordance (a member viewing an owner-only field). */
  editable?: boolean;
  /** A German error from the server, e.g. "Artikel existiert bereits". */
  error?: string | null;
};

/**
 * The shared inline-editing pattern: a piece of text with a dashed underline
 * that turns into a field when tapped, saves on Enter or blur, and cancels on
 * Escape. Used for the project name, the list name and the catalog article name.
 *
 * Why the component decides what "no change" means: every call site would
 * otherwise re-implement trim + compare, and a rename endpoint being hit with
 * the value it already holds is a pointless write that also shows up as a sync
 * delta for every other member.
 */
export function InlineEdit({
  value,
  onSave,
  label,
  editable = true,
  error,
}: InlineEditProps) {
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // Enter saves and closes the editor, which immediately fires a blur. Without
  // this flag the blur handler would run commit() a second time. The same flag
  // is what makes Escape a true cancel rather than "cancel, then save on blur".
  const skipBlur = useRef(false);

  // Leaves edit mode, saving only if the value is meaningful and actually new.
  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) void onSave(next);
  }

  // Leaves edit mode, throwing the draft away.
  function cancel() {
    skipBlur.current = true;
    setDraft(value);
    setEditing(false);
  }

  function startEditing() {
    // Re-seed the draft from the current value so a previously cancelled edit
    // does not reappear the next time the field is opened.
    setDraft(value);
    setEditing(true);
  }

  if (!editable) {
    return <span className={styles.static}>{value}</span>;
  }

  if (!editing) {
    return (
      <span className={styles.wrapper}>
        <button type="button" className={styles.rest} onClick={startEditing}>
          {value}
        </button>
        {error ? <FieldError>{error}</FieldError> : null}
      </span>
    );
  }

  return (
    <span className={styles.wrapper}>
      {/* The label is visually hidden by being absent: the field replaces text
          that is already on screen, so an aria-label carries the name instead. */}
      <input
        id={inputId}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className={[styles.input, error ? styles.invalid : ""].filter(Boolean).join(" ")}
        value={draft}
        // autoFocus is correct here: the field only exists because the user just
        // asked to edit, so focus is exactly where they expect it.
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Stop the browser's default so a parent <form> does not submit
            // when the user commits an inline rename with Enter.
            event.preventDefault();
            skipBlur.current = true;
            commit();
          } else if (event.key === "Escape") {
            cancel();
          }
        }}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false;
            return;
          }
          commit();
        }}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </span>
  );
}
