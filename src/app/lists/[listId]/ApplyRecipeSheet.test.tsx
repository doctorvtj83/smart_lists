// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { recipeLabels } from "@/lib/recipes/labels";
import { ApplyRecipeSheet } from "./ApplyRecipeSheet";
import { APPLY_FORM_IDLE, type ApplyFormState } from "./formState";

const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });
const custom = recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" });

const RECIPES = [
  { id: "r1", name: "Lasagne", itemCount: 6 },
  { id: "r2", name: "Chili", itemCount: 4 },
];

function renderSheet(overrides: Partial<Parameters<typeof ApplyRecipeSheet>[0]> = {}) {
  const props = {
    recipes: RECIPES,
    labels,
    onClose: vi.fn(),
    applyAction: vi.fn(async () => APPLY_FORM_IDLE),
    ...overrides,
  };
  return { ...render(<ApplyRecipeSheet {...props} />), props };
}

describe("ApplyRecipeSheet", () => {
  it("lists every recipe with a stepper starting at 0", () => {
    renderSheet();

    expect(screen.getByRole("spinbutton", { name: "Anzahl Lasagne" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(screen.getByRole("spinbutton", { name: "Anzahl Chili" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });

  it("keeps „Hinzufügen“ disabled until something is actually chosen", async () => {
    renderSheet();

    const submit = screen.getByRole("button", { name: "Hinzufügen" });
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" }));

    expect(screen.getByRole("button", { name: "Hinzufügen" })).toBeEnabled();
  });

  it("posts one selection field per chosen recipe, and none for the others", async () => {
    let received: FormData | null = null;
    const applyAction = vi.fn(async (_prev: ApplyFormState, formData: FormData) => {
      received = formData;
      return APPLY_FORM_IDLE;
    });
    renderSheet({ applyAction });

    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" }));
    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" }));
    await userEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    expect(received!.getAll("selection")).toEqual(["r1:2"]);
    // Every attempt carries a token, so a retry can be recognised as the same apply.
    expect(String(received!.get("applyToken"))).not.toBe("");
  });

  it("shows the result sentence and a „Fertig“ button after a successful apply", () => {
    renderSheet({
      initialState: {
        error: null,
        ok: true,
        message: "Lasagne ×2 hinzugefügt · 4 neue Einträge, 2 zusammengeführt",
      },
    });

    expect(
      screen.getByText("Lasagne ×2 hinzugefügt · 4 neue Einträge, 2 zusammengeführt"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fertig" })).toBeInTheDocument();
    // The picker is gone — the decision has been made.
    expect(screen.queryByRole("spinbutton", { name: "Anzahl Lasagne" })).not.toBeInTheDocument();
  });

  it("offers a retry on failure and keeps the picker's choices", () => {
    renderSheet({
      initialState: { error: "Die Liste ist bereits abgeschlossen", ok: false, message: null },
    });

    expect(screen.getByText("Die Liste ist bereits abgeschlossen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });

  it("uses the project's own wording everywhere", () => {
    renderSheet({ labels: custom });

    expect(screen.getByRole("dialog", { name: "Set hinzufügen" })).toBeInTheDocument();
  });
});
