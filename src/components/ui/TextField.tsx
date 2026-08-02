"use client";

import { useId, type InputHTMLAttributes } from "react";
import { FieldError } from "./FieldError";
import styles from "./TextField.module.css";

// Omit<"size"> because the native `size` attribute (character width) would clash
// with our visual size prop; ours is called fieldSize to keep both available.
type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  /** The small uppercase caption above the field, in German. */
  label?: string;
  /** A German error message. Its presence also turns the border red. */
  error?: string | null;
  fieldSize?: "md" | "sm";
};

/**
 * The project's only text input.
 *
 * Why it exists: label wiring and error wiring are the two things hand-rolled
 * forms always get wrong. Doing them once here means every screen gets a field
 * whose label is clickable and whose error is announced, for free.
 *
 * "use client" is required because of useId(). That is a deliberate trade: the
 * alternative — demanding an explicit `id` at every call site — silently
 * degrades to an unlabelled field the first time someone forgets. Server
 * Components can still render this, so server-action forms are unaffected.
 */
export function TextField({
  label,
  error,
  fieldSize = "md",
  className,
  id,
  ...rest
}: TextFieldProps) {
  // useId gives a stable id across server render and hydration; an explicit
  // `id` prop still wins, so a caller can target the field from elsewhere.
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  const inputClasses = [
    styles.input,
    styles[fieldSize],
    error ? styles.invalid : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.wrapper}>
      {label ? (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={inputClasses}
        // `undefined` (not false/"") so the attributes vanish entirely when the
        // field is valid — a stray aria-invalid="false" confuses some readers.
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
