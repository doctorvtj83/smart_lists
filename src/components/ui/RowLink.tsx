import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Icon } from "./Icon";
import styles from "./RowLink.module.css";

type RowLinkProps = {
  href: string;
  /** The row's headline — also its accessible name. */
  title: string;
  /** Second line, e.g. "3 Listen · 4 Mitglieder". */
  meta?: string;
  /** Usually an <Avatar />. */
  leading?: ReactNode;
  /** Usually a <Badge />; the chevron is added after it automatically. */
  trailing?: ReactNode;
};

/**
 * A tappable card row — the workhorse of Home, Projekte and the list overview.
 *
 * Why a next/link and not a card with a nested link: the design makes the whole
 * card tappable, and an <a> wrapping the row is the only version of that which
 * works with keyboard focus, middle-click and "open in new tab" for free.
 * Consequently the slots must not contain interactive elements — nested
 * interactive content inside a link is invalid HTML and unusable by keyboard.
 */
export function RowLink({ href, title, meta, leading, trailing }: RowLinkProps) {
  return (
    <Link href={href} className={styles.row}>
      {leading}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>
      {trailing}
      <Icon icon={ChevronRight} size={16} className={styles.chevron} />
    </Link>
  );
}
