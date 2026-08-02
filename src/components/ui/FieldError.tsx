import type { ReactNode } from "react";
import styles from "./FieldError.module.css";

type FieldErrorProps = {
  /** Set by TextField so the input's aria-describedby can point here. */
  id?: string;
  children: ReactNode;
};

/**
 * The inline error message under a field.
 *
 * Why it exists: the handoff defines exactly one error presentation ("Rahmen +
 * Meldung in #bf4a41 direkt unter dem Feld, kurzer deutscher Satz"). Giving it
 * its own component means every screen inherits the same shape — including
 * role="alert", which makes a screen reader announce the message the moment it
 * appears instead of leaving the user stuck on a silently rejected form.
 */
export function FieldError({ id, children }: FieldErrorProps) {
  return (
    <p id={id} role="alert" className={styles.error}>
      {children}
    </p>
  );
}
