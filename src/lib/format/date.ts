/**
 * Deterministic German formatting for dates and numbers.
 *
 * Why this module exists: `Date#toLocaleDateString("de-DE")` and
 * `Number#toLocaleString("de-DE")` resolve the *ambient* time zone and rely on
 * the host's locale data. In an App Router page that string is produced twice —
 * once on the server, once during hydration — and any disagreement makes React
 * throw a hydration error (the overlay Slice 13 handed over as open debt).
 *
 * Pinning both the locale and the time zone in a module-level formatter makes
 * the output a pure function of the instant, identical in Node and the browser.
 *
 * Pattern: module-level singleton formatters. `Intl.DateTimeFormat` is expensive
 * to construct and these are stateless, so they are built once per process.
 */

// Europe/Berlin, not UTC: the product is German and users expect the calendar day
// they live in. The zone must be explicit — "the server's zone" is not a value.
const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// maximumFractionDigits: 3 trims Float noise; useGrouping: false keeps "1000"
// from becoming "1.000", which would collide with the decimal-comma convention.
const numberFormatter = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 3,
  useGrouping: false,
});

/** German calendar date, e.g. "31.12.2026". Use for every user-visible date. */
export function formatGermanDate(date: Date): string {
  return dateFormatter.format(date);
}

/** German decimal number, e.g. "1,5". Use for every user-visible quantity. */
export function formatGermanNumber(value: number): string {
  return numberFormatter.format(value);
}
