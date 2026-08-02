// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("exposes value, bounds and an accessible name", () => {
    render(<ProgressBar value={3} max={8} label="3 von 8 erledigt" />);

    const bar = screen.getByRole("progressbar", { name: "3 von 8 erledigt" });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "8");
  });

  // A list with no entries at all must not divide by zero and must not render a
  // full bar — the Weitermachen card links to empty lists too.
  it("renders an empty bar when max is 0", () => {
    render(<ProgressBar value={0} max={0} label="Nichts erledigt" />);

    const bar = screen.getByRole("progressbar", { name: "Nichts erledigt" });
    expect(bar).toHaveAttribute("aria-valuemax", "0");
    expect(bar.querySelector("[data-testid='progress-fill']")).toHaveStyle({ width: "0%" });
  });

  it("clamps a value above max to a full bar", () => {
    render(<ProgressBar value={12} max={8} label="Alles erledigt" />);

    const fill = screen.getByRole("progressbar").querySelector("[data-testid='progress-fill']");
    expect(fill).toHaveStyle({ width: "100%" });
  });
});
