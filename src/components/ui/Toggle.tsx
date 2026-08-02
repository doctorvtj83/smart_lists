"use client";

import styles from "./Toggle.module.css";

type ToggleProps = {
  checked: boolean;
  /** Receives the NEXT state, not a toggle command — see the note below. */
  onChange: (next: boolean) => void;
  /** German accessible name, e.g. "Vorbefüllen". A bare switch says nothing. */
  label: string;
};

/**
 * The pill switch (handoff, „Neue Liste"-Sheet: Vorbefüllen an/aus).
 *
 * Why role="switch" on a <button> and not a checkbox: the design draws a track
 * with a sliding knob, and a checkbox would have to be visually hidden and
 * re-created in CSS anyway. `role="switch"` + `aria-checked` is exactly the
 * semantic a screen reader needs, and a button gives keyboard activation for free.
 *
 * Why onChange receives the next VALUE rather than being a bare onToggle: the
 * caller usually keeps the state, and `onChange={setPrefill}` reads better than a
 * callback that has to re-derive the inverse. It also makes the control usable in
 * a controlled form where the next value is sent somewhere else.
 *
 * "use client" because it has a click handler.
 */
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      // The state lives in a data attribute rather than a second class name so
      // the CSS Module can style track and knob from one selector each.
      data-checked={checked ? "true" : "false"}
      className={styles.track}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} aria-hidden="true" />
    </button>
  );
}
