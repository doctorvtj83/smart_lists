"use client";

import { useId, useState, type ReactNode, type RefObject } from "react";
import type { AutocompleteOption } from "@/lib/catalog/autocomplete";
import styles from "./Autocomplete.module.css";

type AutocompleteProps = {
  /** Controlled: the caller owns the text, because the caller clears it on submit. */
  value: string;
  onChange: (value: string) => void;
  /**
   * Enter on the field, or a tap on a dropdown row. Receives the NAME to use —
   * the typed text, the picked article, or the offered create name.
   */
  onSubmit: (name: string) => void;
  /** Already filtered and capped by `buildAutocomplete`. */
  options: AutocompleteOption[];
  /** The „…“ neu anlegen row, or null. */
  createName: string | null;
  placeholder: string;
  /** German accessible name for the input, e.g. „Eintrag hinzufügen". */
  inputLabel: string;
  /** Optional glyph before the field — the entry row's ＋. */
  leading?: ReactNode;
  disabled?: boolean;
  /** Lets a parent keep focus in the field after a submit. */
  inputRef?: RefObject<HTMLInputElement | null>;
};

/**
 * An inline text field with a suggestion dropdown floating ABOVE it (handoff
 * §10). The trailing entry row is its first customer; the Favoriten add row
 * adopts it in the same slice, which is why it is a primitive and not a piece of
 * the list screen.
 *
 * Why the dropdown sits above: the row is the LAST thing on the screen, so a
 * dropdown below it would open under the keyboard on a phone.
 *
 * Why the rows are plain <button>s rather than an ARIA listbox: a real combobox
 * needs `aria-activedescendant` plus arrow-key navigation, and the design offers
 * neither an active-row highlight nor keyboard traversal. A listbox whose
 * options cannot be traversed is worse than no listbox — and interactive
 * children inside `role="option"` are invalid anyway. Buttons are individually
 * reachable by Tab, and Enter in the field always submits the typed text, so
 * nothing here is keyboard-only-inaccessible. Revisit if the design ever grows a
 * highlighted row.
 */
export function Autocomplete({
  value,
  onChange,
  onSubmit,
  options,
  createName,
  placeholder,
  inputLabel,
  leading,
  disabled = false,
  inputRef,
}: AutocompleteProps) {
  // useId keeps the label association stable across server render and hydration.
  const inputId = useId();
  // Escape hides the dropdown for THIS query without clearing the field. Stored
  // as the dismissed value (not a boolean) so a later keystroke re-arms the
  // dropdown automatically — no useEffect/setState cascade when `value` changes.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const dismissed = dismissedFor === value;

  const hasDropdown = !dismissed && (options.length > 0 || createName !== null);

  // Shared by Enter and by the create row: never submit whitespace.
  const submit = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className={styles.field}>
      <div className={styles.row}>
        {leading}
        <input
          id={inputId}
          ref={inputRef}
          className={styles.input}
          type="text"
          value={value}
          placeholder={placeholder}
          aria-label={inputLabel}
          // The browser's own autofill dropdown would fight ours for the space.
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              // The row lives inside no <form>, but a parent might; stop the
              // keystroke from submitting anything else.
              event.preventDefault();
              submit(value);
            }
            if (event.key === "Escape") setDismissedFor(value);
          }}
        />
      </div>

      {hasDropdown && (
        <ul className={styles.dropdown}>
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={styles.option}
                // A pointerdown that blurs the input would tear the dropdown down
                // before the click lands; preventing the default keeps focus.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => submit(option.name)}
              >
                {option.name}
                {option.hint ? <span className={styles.hint}> {option.hint}</span> : null}
              </button>
            </li>
          ))}
          {createName !== null && (
            <li>
              <button
                type="button"
                className={styles.option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => submit(createName)}
              >
                {`„${createName}“ neu anlegen`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
