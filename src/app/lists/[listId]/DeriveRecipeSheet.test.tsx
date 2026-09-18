// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { recipeLabels } from "@/lib/recipes/labels";
import { DeriveRecipeSheet } from "./DeriveRecipeSheet";
import { DERIVE_FORM_IDLE, type DeriveFormState } from "./formState";

const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

const ENTRIES = [
  { id: "e1", catalogItemId: "c-hack", name: "Hackfleisch", quantity: 500, unit: "g" },
  { id: "e2", catalogItemId: "c-milch", name: "Milch", quantity: 1, unit: "l" },
  { id: "e3", catalogItemId: "c-salz", name: "Salz", quantity: null, unit: null },
];

function renderSheet(overrides: Partial<Parameters<typeof DeriveRecipeSheet>[0]> = {}) {
  const props = {
    entries: ENTRIES,
    labels,
    units: ["g", "l"],
    onClose: vi.fn(),
    createAction: vi.fn(async () => DERIVE_FORM_IDLE),
    ...overrides,
  };
  return { ...render(<DeriveRecipeSheet {...props} />), props };
}

describe("DeriveRecipeSheet", () => {
  it("offers every entry with its amount, nothing pre-selected", () => {
    renderSheet();

    expect(screen.getByRole("checkbox", { name: "500 g Hackfleisch" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "1 l Milch" })).not.toBeChecked();
    // An unquantified row shows the bare name — formatQuantityLabel returns "".
    expect(screen.getByRole("checkbox", { name: "Salz" })).not.toBeChecked();
  });

  it("keeps „Weiter“ disabled until something is ticked", async () => {
    renderSheet();

    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: "1 l Milch" }));

    expect(screen.getByRole("button", { name: "Weiter" })).toBeEnabled();
  });

  it("carries the list's amounts into step ② as editable fields", async () => {
    renderSheet();

    await userEvent.click(screen.getByRole("checkbox", { name: "1 l Milch" }));
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));

    expect(screen.getByRole("textbox", { name: "Menge Milch" })).toHaveValue("1");
    // `list` maps an input to the combobox role (the project's unit datalist).
    expect(screen.getByRole("combobox", { name: "Einheit Milch" })).toHaveValue("l");
    // The name field sits next to the button that commits it (spec §7).
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
  });

  it("shows a German decimal in the quantity field", async () => {
    renderSheet({
      entries: [{ id: "e9", catalogItemId: "c-x", name: "Öl", quantity: 0.5, unit: "l" }],
    });

    await userEvent.click(screen.getByRole("checkbox", { name: "0,5 l Öl" }));
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));

    expect(screen.getByRole("textbox", { name: "Menge Öl" })).toHaveValue("0,5");
  });

  it("posts the name, the ticked entries and their edited amounts", async () => {
    let received: FormData | null = null;
    const createAction = vi.fn(async (_prev: DeriveFormState, formData: FormData) => {
      received = formData;
      return DERIVE_FORM_IDLE;
    });
    renderSheet({ createAction });

    await userEvent.click(screen.getByRole("checkbox", { name: "1 l Milch" }));
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Menge Milch" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Menge Milch" }), "0,5");
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Lasagne");
    await userEvent.click(screen.getByRole("button", { name: "Rezept anlegen" }));

    expect(received!.get("name")).toBe("Lasagne");
    expect(received!.getAll("entryId")).toEqual(["e2"]);
    expect(received!.get("quantity:e2")).toBe("0,5");
    expect(received!.get("unit:e2")).toBe("l");
  });

  it("goes back to step ① without losing the selection", async () => {
    renderSheet();

    await userEvent.click(screen.getByRole("checkbox", { name: "1 l Milch" }));
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));

    expect(screen.getByRole("checkbox", { name: "1 l Milch" })).toBeChecked();
  });

  it("confirms the result and offers the loop", () => {
    renderSheet({
      initialState: { error: null, ok: true, createdName: "Lasagne", lineCount: 4 },
    });

    expect(screen.getByText("„Lasagne“ angelegt · 4 Artikel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fertig" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weiteres Rezept" })).toBeInTheDocument();
  });

  it("loops back to a clean step ① instead of closing", async () => {
    renderSheet({
      initialState: { error: null, ok: true, createdName: "Lasagne", lineCount: 1 },
    });

    await userEvent.click(screen.getByRole("button", { name: "Weiteres Rezept" }));

    // Back on the selection pane with nothing carried over — the sheet stays open so several
    // recipes can be built from one list (spec §7, step ③).
    expect(screen.getByRole("checkbox", { name: "1 l Milch" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Fertig" })).not.toBeInTheDocument();
  });

  it("greys a row consumed by the previous pass but leaves it selectable", async () => {
    // A full pass: tick Milch, advance, save (the stub returns ok), then loop.
    const createAction = vi.fn(async () => ({
      error: null,
      ok: true,
      createdName: "Lasagne",
      lineCount: 1,
    }));
    renderSheet({ createAction });

    await userEvent.click(screen.getByRole("checkbox", { name: "1 l Milch" }));
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Lasagne");
    await userEvent.click(screen.getByRole("button", { name: "Rezept anlegen" }));
    await userEvent.click(screen.getByRole("button", { name: "Weiteres Rezept" }));

    // An article may legitimately belong to two recipes, so the hint must not disable anything.
    const milk = screen.getByRole("checkbox", { name: "1 l Milch" });
    expect(milk).toBeEnabled();
    await userEvent.click(milk);
    expect(milk).toBeChecked();
  });

  it("renders an inline error and stays on step ②", () => {
    renderSheet({
      initialState: {
        error: "Milch ist zweimal ausgewählt (1 l und 500 ml) — bitte nur eine Zeile wählen",
        ok: false,
        createdName: null,
        lineCount: 0,
      },
    });

    expect(
      screen.getByText("Milch ist zweimal ausgewählt (1 l und 500 ml) — bitte nur eine Zeile wählen"),
    ).toBeInTheDocument();
  });

  it("uses the project's own wording", () => {
    renderSheet({ labels: recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" }) });

    expect(screen.getByRole("dialog", { name: "Set aus Liste anlegen" })).toBeInTheDocument();
  });
});
