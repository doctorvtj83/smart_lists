"use client";

import { Minus, Plus } from "lucide-react";
import { Icon } from "./Icon";
import styles from "./Stepper.module.css";

type StepperProps = {
  value: number;
  /** Receives the NEXT value, not a direction — the same contract as `Toggle`'s onChange. */
  onChange: (next: number) => void;
  /**
   * German accessible name of the thing being counted, e.g. „Anzahl Lasagne“. The two buttons
   * derive their own names from it („… erhöhen“ / „… verringern“), so a screen reader never
   * announces a bare „plus“ with no idea what it increments.
   */
  label: string;
  /** 0 by default: in both pickers 0 means „not chosen“, which is a legal state. */
  min?: number;
  /** 99 by default — MAX_RECIPE_COUNT, mirrored here so the UI cannot offer an invalid count. */
  max?: number;
};

/**
 * The `[− N +]` counter (spec §6: the recipe picker's stepper).
 *
 * Why a primitive rather than two buttons inside each sheet: both the list's „Rezept hinzufügen“
 * sheet and the „Neue Liste“ sheet's second pane need it, and a control this small is exactly the
 * kind that drifts into two slightly different versions.
 *
 * Why `role="spinbutton"` on the read-only value instead of a number `<input>`: a numeric input on
 * iOS opens the keypad and invites free text the picker would then have to validate, while the
 * design draws a value that is only ever changed by the two buttons. `spinbutton` + aria-valuenow
 * is precisely the semantic for "a value you step through", and it keeps the component a
 * controlled, keyboard-reachable display. It is `tabIndex={-1}` because the two buttons already
 * carry the interaction; a third stop would only cost keyboard users a press.
 *
 * Bounds are enforced twice on purpose — the buttons are disabled AND the callback clamps. The
 * disabled state is the affordance; the clamp is what holds if a caller ever drives this
 * programmatically.
 */
export function Stepper({ value, onChange, label, min = 0, max = 99 }: StepperProps) {
  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.button}
        aria-label={`${label} verringern`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Icon icon={Minus} size={16} />
      </button>
      <span
        className={styles.value}
        role="spinbutton"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={-1}
      >
        {value}
      </span>
      <button
        type="button"
        className={styles.button}
        aria-label={`${label} erhöhen`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Icon icon={Plus} size={16} />
      </button>
    </div>
  );
}
