import styles from "./ChipTabs.module.css";

type ChipTabsProps = {
  /** In display order. The list screen supplies "Alle" first, "Ohne Kategorie" last. */
  options: string[];
  /** The active option. May be absent from `options` — see the comment below. */
  value: string;
  onChange: (next: string) => void;
  /** German accessible name for the whole tab row, e.g. "Kategorien". */
  label: string;
};

/**
 * The underlined filter tab row above a list's content.
 *
 * Why role="tablist" and not a nav: these are a filter over the content directly
 * below them, not navigation (the handoff is explicit: "Kategorie-Chips ≠
 * Navigation"). The tab pattern is exactly that semantic.
 *
 * The active option is rendered even when it is missing from `options`. That is
 * the design's rule that the active chip survives its category going empty —
 * the screen then shows an empty state instead of silently jumping back to
 * "Alle", which would lose the user's place.
 */
export function ChipTabs({ options, value, onChange, label }: ChipTabsProps) {
  const visible = options.includes(value) ? options : [...options, value];

  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {visible.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            className={[styles.tab, active ? styles.active : ""].filter(Boolean).join(" ")}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
