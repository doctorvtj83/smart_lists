import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

type EmptyStateProps = {
  /** Usually an <Icon />; the 52px frame around it is drawn here. */
  icon: ReactNode;
  /** German headline, e.g. "Noch keine Favoriten". */
  title: string;
  /** Exactly one German sentence explaining what will fill this screen. */
  description: string;
  shape?: "circle" | "square";
  tone?: "accent" | "neutral";
  /** The next step — an input + button pair, or a single call to action. */
  children?: ReactNode;
};

/**
 * The one empty-state pattern, used by all seven empty screens in the design
 * (no projects, project without lists, empty list, emptied category filter, no
 * favourites, empty catalog, empty archive).
 *
 * Why one component for all seven: the design's whole point is that an empty
 * screen is not an error but an invitation — glyph, one sentence, and the action
 * immediately below it. Seven hand-built versions would drift apart within two
 * slices; one component with two visual knobs (shape, tone) cannot.
 *
 * The title is an <h2> for the same reason SectionLabel is: on an empty screen
 * it is frequently the only heading there is.
 */
export function EmptyState({
  icon,
  title,
  description,
  shape = "circle",
  tone = "neutral",
  children,
}: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <span className={[styles.glyph, styles[shape], styles[tone]].join(" ")}>{icon}</span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      {children ? <div className={styles.action}>{children}</div> : null}
    </div>
  );
}
