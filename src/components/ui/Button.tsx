import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "text" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Stretches the button and enlarges it — the call to action at a sheet's foot. */
  fullWidth?: boolean;
};

/**
 * The project's only button.
 *
 * Why it exists: the design uses four visually distinct action weights and every
 * screen mixes them. Centralising them means a screen picks a *weight*, never a
 * colour — which is what keeps the destructive red reserved for destructive acts.
 *
 * Deliberately NOT a client component: it holds no state, so a Server Component
 * can render it inside a server-action <form>. `type` defaults to "button"
 * because HTML's default is "submit", which silently submits surrounding forms.
 */
export function Button({
  variant = "primary",
  fullWidth = false,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  // filter(Boolean) drops the empty slots so the class attribute stays clean.
  const classes = [styles.button, styles[variant], fullWidth ? styles.fullWidth : "", className]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classes} {...rest} />;
}
