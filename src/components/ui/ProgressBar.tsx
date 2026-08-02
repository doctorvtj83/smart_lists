import styles from "./ProgressBar.module.css";

type ProgressBarProps = {
  /** How much is done. Clamped into [0, max] before rendering. */
  value: number;
  /** The total. May be 0 (an empty list) — the component must survive that. */
  max: number;
  /** German accessible name, e.g. "3 von 8 erledigt". Required: a bare bar says nothing. */
  label: string;
};

/**
 * The design's 5px progress track (Weitermachen card).
 *
 * Why it is its own primitive rather than two divs inside ContinueCard: it is
 * the only place in the app that has to be announced as a measurement, and the
 * ARIA wiring (role + the three value attributes) is exactly the kind of detail
 * that gets forgotten when it is inlined into a screen.
 *
 * The fill width is the one legitimate inline style in this codebase: it is a
 * computed value per render, which a CSS Module cannot express.
 */
export function ProgressBar({ value, max, label }: ProgressBarProps) {
  // Guard the two degenerate inputs: max === 0 would divide by zero, and a value
  // above max would overflow the track. Both are reachable (empty list, and a
  // stale count racing a poll), so they are handled, not asserted away.
  const ratio = max > 0 ? Math.min(Math.max(value, 0) / max, 1) : 0;

  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={styles.fill}
        data-testid="progress-fill"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
