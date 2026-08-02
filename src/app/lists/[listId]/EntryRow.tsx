"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { formatQuantityLabel } from "@/lib/format/quantity";
import { isSwipeStarted, shouldDeleteOnRelease, swipeOffset } from "@/lib/lists/swipe";
import styles from "./EntryRow.module.css";

/**
 * One entry as the client sees it — the flattened shape the page hands down.
 * Defined here (not in ListBody) because ListBody imports this component, and
 * the type has to travel the other way without a circular import.
 */
export interface ListEntry {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  checked: boolean;
}

type EntryRowProps = {
  entry: ListEntry;
  /** A completed list is read-only: desaturated, no checking, no swipe, no sheet. */
  frozen: boolean;
  /** Receives the TARGET state, matching check_item's idempotent semantics. */
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
  onDelete: () => void;
};

/**
 * One list entry (handoff §10): check circle · name · quantity, tap to open the
 * detail sheet, swipe left to delete.
 *
 * Two tap targets, two buttons: the circle checks, the rest of the row opens the
 * sheet. Splitting them into real <button>s (rather than one div with an onClick
 * and a stopPropagation) is what makes both reachable by keyboard and correctly
 * announced — the design's "Check-Kreis (größtes Tap-Target)" and "Tap auf Zeile
 * (nicht Checkbox) öffnet das Eintrag-Sheet", expressed in HTML.
 *
 * The swipe is a POINTER gesture on the wrapper, so it works for mouse and touch
 * alike and needs no library. It is deliberately not the only way to delete: the
 * entry sheet's „Eintrag löschen" is the keyboard- and screen-reader-accessible
 * path, because a swipe cannot be one.
 */
export function EntryRow({ entry, frozen, onToggle, onOpen, onDelete }: EntryRowProps) {
  // How far the row currently follows the finger. null = not swiping, so the CSS
  // transition (snap-back) is only active when the finger is off the glass.
  const [offset, setOffset] = useState<number | null>(null);
  // Where the gesture started, and whether it ever became a real drag. A ref, not
  // state: changing it must not re-render mid-gesture.
  const gesture = useRef<{ startX: number; moved: boolean } | null>(null);
  // Set for a moment after a swipe so the click that follows a drag does not open
  // the sheet. The prototype uses the same 150ms guard.
  const justSwiped = useRef(false);

  const quantityLabel = formatQuantityLabel(entry.quantity, entry.unit);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (frozen) return;
    gesture.current = { startX: event.clientX, moved: false };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const current = gesture.current;
    if (!current) return;
    // A mouse that left the row with the button released is not a drag any more.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      gesture.current = null;
      setOffset(null);
      return;
    }
    const next = swipeOffset(current.startX, event.clientX);
    // Only commit to the gesture past the tolerance, so a tap's jitter never
    // nudges the row.
    if (current.moved || isSwipeStarted(next)) {
      gesture.current = { ...current, moved: true };
      setOffset(next);
    }
  };

  const handlePointerUp = () => {
    const current = gesture.current;
    gesture.current = null;
    if (!current) return;

    if (current.moved) {
      justSwiped.current = true;
      window.setTimeout(() => {
        justSwiped.current = false;
      }, 150);
    }

    const released = offset ?? 0;
    // Drop the offset first: the row snaps back under the CSS transition even in
    // the delete case, which is what it does while the server round-trip runs.
    setOffset(null);
    if (shouldDeleteOnRelease(released)) onDelete();
  };

  const openSheet = () => {
    // A drag that ended over the row body still fires a click; swallow it.
    if (justSwiped.current) return;
    onOpen();
  };

  return (
    <li className={styles.wrap} data-item-id={entry.id}>
      {/* The red surface the row slides off. aria-hidden: the accessible way to
          delete is the sheet's button, and announcing a decorative layer would
          only add noise. */}
      <span
        className={styles.deleteSurface}
        aria-hidden="true"
        style={{ opacity: (offset ?? 0) < 0 ? 1 : 0 }}
      >
        Löschen
      </span>

      <div
        className={[styles.row, offset === null ? styles.settling : ""].filter(Boolean).join(" ")}
        // The only inline style in this component: a per-pixel transform no CSS
        // Module can express (the ProgressBar precedent).
        style={{ transform: `translateX(${offset ?? 0}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {frozen ? (
          // Frozen: the circle is decoration, not a control.
          <span className={[styles.check, styles.checkArchived].join(" ")}>
            <Icon icon={Check} size={12} />
          </span>
        ) : (
          <button
            type="button"
            className={[styles.check, entry.checked ? styles.checked : ""].filter(Boolean).join(" ")}
            // A stable label plus aria-pressed: the label names WHAT, the state
            // says whether it is on — a label that flips wording would re-announce
            // the whole control on every tap.
            aria-label={`${entry.name} abhaken`}
            aria-pressed={entry.checked}
            onClick={() => onToggle(!entry.checked)}
          >
            {entry.checked ? <Icon icon={Check} size={12} /> : null}
          </button>
        )}

        {frozen ? (
          <>
            <span className={[styles.name, styles.nameChecked].join(" ")}>{entry.name}</span>
            {quantityLabel ? <span className={styles.quantity}>{quantityLabel}</span> : null}
          </>
        ) : (
          <button
            type="button"
            className={styles.body}
            aria-label={`${entry.name} bearbeiten`}
            onClick={openSheet}
          >
            <span className={[styles.name, entry.checked ? styles.nameChecked : ""].filter(Boolean).join(" ")}>
              {entry.name}
            </span>
            {quantityLabel ? <span className={styles.quantity}>{quantityLabel}</span> : null}
          </button>
        )}
      </div>
    </li>
  );
}
