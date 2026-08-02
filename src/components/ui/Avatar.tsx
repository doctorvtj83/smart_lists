import type { CSSProperties } from "react";
import { avatarColor } from "./avatarColor";
import styles from "./Avatar.module.css";

type AvatarProps = {
  /** Project or person name; the first letter becomes the glyph. */
  name: string;
  /** Edge length in px. 28 in the Home rows, 30 in the Projekte/Mitglieder rows. */
  size?: number;
};

/**
 * The rounded-square initial next to a project or member name.
 *
 * Why aria-hidden: the avatar never carries information the adjacent text does
 * not already state, so announcing "H" before "Haushalt" is pure noise.
 *
 * Sizing goes through inline CSS custom properties rather than a class per size.
 * The design uses 28px and 30px today and the drawer will want another; a
 * variable keeps that a number at the call site instead of a new CSS class each
 * time. The radius and font size are derived so the proportions stay right.
 */
export function Avatar({ name, size = 30 }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase();

  // Ratios read off the handoff: 30px box → 9px radius → 14px letter.
  const style = {
    "--avatar-size": `${size}px`,
    "--avatar-radius": `${Math.round(size * 0.3)}px`,
    "--avatar-font-size": `${Math.round(size * 0.47)}px`,
    "--avatar-bg": avatarColor(name),
  } as CSSProperties;

  return (
    <span className={styles.avatar} style={style} aria-hidden="true">
      {initial}
    </span>
  );
}
