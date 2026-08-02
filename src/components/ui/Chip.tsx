import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Icon } from "./Icon";
import styles from "./Chip.module.css";

export type ChipTone = "outline" | "accent" | "neutral";

type ChipProps = {
  children: ReactNode;
  tone?: ChipTone;
  /** Accent-filled: the currently chosen category in the entry sheet. */
  selected?: boolean;
  /** Struck through: a pre-fill suggestion the user switched off. */
  struck?: boolean;
  /** Makes the whole chip a toggle button. Mutually exclusive with onRemove. */
  onClick?: () => void;
  /** Adds a ✕ button inside the chip. Mutually exclusive with onClick. */
  onRemove?: () => void;
  /** German accessible name for the ✕, e.g. "Milch entfernen". */
  removeLabel?: string;
};

/**
 * The pill chip, in all the shapes the design uses: favourites (removable),
 * pre-fill preview (toggleable, strikeable), and the category picker inside the
 * entry sheet (selectable).
 *
 * Why onClick and onRemove are mutually exclusive: a chip with both would need a
 * button inside a button, which is invalid HTML and unreachable by keyboard. The
 * design never asks for both — favourites are removed, preview chips are
 * toggled — so the component encodes that rather than papering over it.
 */
export function Chip({
  children,
  tone = "neutral",
  selected = false,
  struck = false,
  onClick,
  onRemove,
  removeLabel = "Entfernen",
}: ChipProps) {
  // Order matters: struck and selected are states that override the base tone.
  const classes = [
    styles.chip,
    styles[tone],
    selected ? styles.selected : "",
    struck ? styles.struck : "",
    onClick ? styles.interactive : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Whole-chip toggle. aria-pressed is what tells a screen reader this is a
  // two-state control rather than a plain action.
  if (onClick && !onRemove) {
    return (
      <button type="button" className={classes} aria-pressed={selected} onClick={onClick}>
        {children}
      </button>
    );
  }

  // Static chip, optionally with its own small remove button.
  return (
    <span className={classes}>
      {children}
      {onRemove ? (
        <button type="button" className={styles.remove} aria-label={removeLabel} onClick={onRemove}>
          <Icon icon={X} size={12} />
        </button>
      ) : null}
    </span>
  );
}
