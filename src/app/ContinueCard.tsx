import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { ContinueCardData } from "@/lib/lists/continue";
import { formatOpenOfTotal } from "@/lib/format/plural";
import styles from "./ContinueCard.module.css";

/**
 * The Home screen's "WEITERMACHEN" hero card: one tap back into the list the
 * user last worked on.
 *
 * Why it is not a <RowLink>: RowLink is a single-line row with a meta line, and
 * this card additionally carries a progress bar and uses a larger title weight.
 * Forcing it into RowLink would mean adding a slot nothing else uses.
 *
 * Co-located with page.tsx rather than living in components/ui because it is a
 * screen composition, not a reusable primitive (same precedent as
 * lists/[listId]/ListSyncPoller.tsx).
 *
 * Like RowLink, the whole card is one <a>, so nothing inside may be interactive.
 */
export function ContinueCard({ data }: { data: ContinueCardData }) {
  // The bar fills with what is DONE, while the label counts what is OPEN — the
  // design shows a partially filled bar next to "5 von 8 offen", so the two read
  // as complementary rather than contradictory.
  const doneCount = data.totalCount - data.openCount;

  return (
    <Link href={`/lists/${data.listId}`} className={styles.card}>
      <span className={styles.head}>
        <span className={styles.name}>{data.listName}</span>
        <Icon icon={ChevronRight} size={16} className={styles.chevron} />
      </span>
      {/* "Haushalt · 5 von 8 offen" — project first, exactly as in handoff 3c. */}
      <span className={styles.meta}>
        {data.projectName} · {formatOpenOfTotal(data.openCount, data.totalCount)}
      </span>
      <span className={styles.progress}>
        <ProgressBar
          value={doneCount}
          max={data.totalCount}
          label={`${doneCount} von ${data.totalCount} erledigt`}
        />
      </span>
    </Link>
  );
}
