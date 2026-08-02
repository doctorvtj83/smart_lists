// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ListEntry } from "./EntryRow";
import { EntrySheet } from "./EntrySheet";

const milch: ListEntry = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Milch",
  quantity: 1.5,
  unit: "l",
  category: "Molkerei",
  checked: false,
};

function renderSheet(overrides: Partial<Parameters<typeof EntrySheet>[0]> = {}) {
  const props = {
    entry: milch,
    categories: ["Backwaren", "Molkerei", "Obst & Gemüse"],
    error: null,
    onClose: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return { ...render(<EntrySheet {...props} />), props };
}

describe("EntrySheet", () => {
  it("is titled with the article name", () => {
    renderSheet();
    expect(screen.getByRole("dialog", { name: "Milch" })).toBeInTheDocument();
  });

  it("prefills the three fields from the entry, quantity with a German comma", () => {
    renderSheet();
    expect(screen.getByLabelText("Menge")).toHaveValue("1,5");
    expect(screen.getByLabelText("Einheit")).toHaveValue("l");
    expect(screen.getByLabelText("Kategorie")).toHaveValue("Molkerei");
  });

  it("marks the entry's category chip as selected", () => {
    renderSheet();
    expect(screen.getByRole("button", { name: "Molkerei" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Backwaren" })).toHaveAttribute("aria-pressed", "false");
  });

  it("names the catalog flow-back explicitly", () => {
    renderSheet();
    expect(
      screen.getByText("Kategorie und Einheit werden als neuer Standard im Katalog gemerkt."),
    ).toBeInTheDocument();
  });

  // THE load-bearing test of this slice's merge behaviour: an unchanged field must
  // not be sent, or it would overwrite a concurrent remote edit (LWW).
  it("saves only the fields that actually changed", async () => {
    const onSave = vi.fn();
    renderSheet({ onSave });

    await userEvent.clear(screen.getByLabelText("Menge"));
    await userEvent.type(screen.getByLabelText("Menge"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    expect(onSave).toHaveBeenCalledWith({ quantity: 2 });
  });

  it("saves nothing at all when nothing changed", async () => {
    const onSave = vi.fn();
    renderSheet({ onSave });

    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    expect(onSave).toHaveBeenCalledWith({});
  });

  it("clears a field with null rather than an empty string", async () => {
    const onSave = vi.fn();
    renderSheet({ onSave });

    await userEvent.clear(screen.getByLabelText("Einheit"));
    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    expect(onSave).toHaveBeenCalledWith({ unit: null });
  });

  it("writes a tapped chip into the category field", async () => {
    const onSave = vi.fn();
    renderSheet({ onSave });

    await userEvent.click(screen.getByRole("button", { name: "Backwaren" }));

    expect(screen.getByLabelText("Kategorie")).toHaveValue("Backwaren");

    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));
    expect(onSave).toHaveBeenCalledWith({ category: "Backwaren" });
  });

  it("clears the category when the selected chip is tapped again", async () => {
    const onSave = vi.fn();
    renderSheet({ onSave });

    await userEvent.click(screen.getByRole("button", { name: "Molkerei" }));
    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    expect(onSave).toHaveBeenCalledWith({ category: null });
  });

  it("deletes the entry from the sheet", async () => {
    const onDelete = vi.fn();
    renderSheet({ onDelete });

    await userEvent.click(screen.getByRole("button", { name: "Eintrag löschen" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("shows a German error next to the quantity field", () => {
    renderSheet({ error: "Menge muss eine positive Zahl sein" });
    expect(screen.getByText("Menge muss eine positive Zahl sein")).toBeInTheDocument();
  });

  it("renders no chip row when the project knows no categories yet", () => {
    renderSheet({ categories: [] });
    expect(screen.queryByRole("button", { name: "Molkerei" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Kategorie")).toBeInTheDocument();
  });
});
