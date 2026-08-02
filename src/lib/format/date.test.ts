import { describe, expect, it } from "vitest";
import { formatGermanDate, formatGermanNumber } from "./date";

describe("formatGermanDate", () => {
  it("formats as DD.MM.YYYY", () => {
    expect(formatGermanDate(new Date("2026-12-31T12:00:00Z"))).toBe("31.12.2026");
  });

  it("pads single-digit days and months", () => {
    expect(formatGermanDate(new Date("2026-07-05T12:00:00Z"))).toBe("05.07.2026");
  });

  // The whole point of the helper: the calendar day is resolved in Europe/Berlin,
  // never in the ambient time zone. Without the pinned zone a server rendering in
  // UTC and a browser in CEST disagree about this instant -> hydration mismatch.
  it("resolves the calendar day in Europe/Berlin, not in the ambient zone", () => {
    // 2026-07-29 22:30 UTC is already 2026-07-30 00:30 in Berlin (CEST, UTC+2).
    expect(formatGermanDate(new Date("2026-07-29T22:30:00Z"))).toBe("30.07.2026");
  });
});

describe("formatGermanNumber", () => {
  it("uses the decimal comma", () => {
    expect(formatGermanNumber(1.5)).toBe("1,5");
  });

  it("prints whole numbers without a decimal part", () => {
    expect(formatGermanNumber(3)).toBe("3");
  });

  // Quantities are Float in the schema; 0.1 + 0.2 style noise must not leak into the UI.
  it("caps the fraction at three digits", () => {
    expect(formatGermanNumber(0.30000000000000004)).toBe("0,3");
  });

  // No thousands separator: a quantity of 1000 is "1000", not "1.000" — the dot would
  // read as a decimal point next to the comma convention used above.
  it("does not group thousands", () => {
    expect(formatGermanNumber(1000)).toBe("1000");
  });
});
