import type { ReactNode } from "react";
import styles from "./Card.module.css";

type CardProps = {
  children: ReactNode;
  /** Radius 14 instead of 12 — the Home hero card and the drawer panels. */
  elevated?: boolean;
  /** Padding and layout are the caller's job; see the comment below. */
  className?: string;
};

/**
 * The white surface every grouped block sits on.
 *
 * Why it carries no padding: the design pads a members card (12px 14px), a
 * catalog panel (12px 14px + inner fields) and the Home hero (14px) differently,
 * and a card that guesses would be fought at every call site. The card owns the
 * surface — background, border, radius, shadow — and nothing else.
 */
export function Card({ children, elevated = false, className }: CardProps) {
  const classes = [styles.card, elevated ? styles.elevated : "", className]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
