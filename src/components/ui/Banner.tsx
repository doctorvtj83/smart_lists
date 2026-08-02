import type { ReactNode } from "react";
import styles from "./Banner.module.css";

type BannerProps = {
  /** "info" = accent tint (prompts), "success" = green tint (completed list). */
  tone: "info" | "success";
  /** The German message. */
  children: ReactNode;
  /** Optional leading glyph. */
  icon?: ReactNode;
  /** Optional trailing control, e.g. "Abschließen" / "Wieder öffnen". */
  action?: ReactNode;
};

/**
 * The quiet, full-width message strip above a screen's content.
 *
 * Why role="status": these banners appear in reaction to something the user did
 * (the last entry got checked; the list was completed), and a polite live region
 * is what tells a screen-reader user that without stealing focus. The design is
 * explicit that this moment stays understated — "bewusst leise, kein Konfetti".
 */
export function Banner({ tone, children, icon, action }: BannerProps) {
  return (
    <div role="status" className={[styles.banner, styles[tone]].join(" ")}>
      {icon}
      <span className={styles.text}>{children}</span>
      {action ? <span className={styles.action}>{action}</span> : null}
    </div>
  );
}
