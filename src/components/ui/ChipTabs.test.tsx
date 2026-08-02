// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChipTabs } from "./ChipTabs";

const OPTIONS = ["Alle", "Molkerei", "Ohne Kategorie"];

describe("ChipTabs", () => {
  it("renders one tab per option inside a labelled tablist", () => {
    render(<ChipTabs options={OPTIONS} value="Alle" onChange={() => {}} label="Kategorien" />);

    expect(screen.getByRole("tablist", { name: "Kategorien" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("marks exactly the active option as selected", () => {
    render(<ChipTabs options={OPTIONS} value="Molkerei" onChange={() => {}} label="Kategorien" />);

    expect(screen.getByRole("tab", { name: "Molkerei" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Alle" })).toHaveAttribute("aria-selected", "false");
  });

  it("reports the picked option", async () => {
    const onChange = vi.fn();
    render(<ChipTabs options={OPTIONS} value="Alle" onChange={onChange} label="Kategorien" />);

    await userEvent.click(screen.getByRole("tab", { name: "Ohne Kategorie" }));

    expect(onChange).toHaveBeenCalledWith("Ohne Kategorie");
  });

  it("keeps rendering an active option that is no longer in the list", () => {
    // The design requires the active chip to survive its category going empty —
    // the screen shows an empty state instead of falling back to "Alle".
    render(
      <ChipTabs options={["Alle"]} value="Molkerei" onChange={() => {}} label="Kategorien" />,
    );

    expect(screen.getByRole("tab", { name: "Molkerei" })).toHaveAttribute("aria-selected", "true");
  });
});
