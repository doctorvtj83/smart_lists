// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeItemSheet } from "./RecipeItemSheet";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "../formState";
import type { RecipeLine } from "./RecipeDetail";

const milch: RecipeLine = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Milch",
  quantity: 1.5,
  unit: "l",
};

const idle = async (): Promise<RecipeFormState> => RECIPE_FORM_IDLE;

function renderSheet(overrides: Partial<Parameters<typeof RecipeItemSheet>[0]> = {}) {
  const props = {
    line: milch,
    recipeId: "11111111-1111-4111-8111-111111111111",
    onClose: vi.fn(),
    updateAction: idle,
    removeAction: idle,
    ...overrides,
  };
  return { ...render(<RecipeItemSheet {...props} />), props };
}

describe("RecipeItemSheet", () => {
  it("is titled with the article and seeded with the line's values", () => {
    renderSheet();

    expect(screen.getByRole("dialog", { name: "Milch" })).toBeInTheDocument();
    // German decimal comma in the field, because that is what the user will type back.
    expect(screen.getByLabelText("Menge")).toHaveValue("1,5");
    expect(screen.getByLabelText("Einheit")).toHaveValue("l");
  });

  it("has NO category field — a recipe line inherits the article's category at apply time", () => {
    renderSheet();

    expect(screen.queryByLabelText("Kategorie")).not.toBeInTheDocument();
  });

  it("seeds an unquantified line with empty fields", () => {
    renderSheet({ line: { ...milch, name: "Salz", quantity: null, unit: null } });

    expect(screen.getByLabelText("Menge")).toHaveValue("");
    expect(screen.getByLabelText("Einheit")).toHaveValue("");
  });

  it("sends the edited values, including the line id, on Fertig", async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn(idle);
    renderSheet({ updateAction });

    await user.clear(screen.getByLabelText("Menge"));
    await user.type(screen.getByLabelText("Menge"), "0,5");
    await user.click(screen.getByRole("button", { name: "Fertig" }));

    const formData = updateAction.mock.calls[0][1] as FormData;
    // The raw German string travels; the SERVER calls parseGermanDecimal, so there is one parser.
    expect(formData.get("quantity")).toBe("0,5");
    expect(formData.get("recipeItemId")).toBe(milch.id);
  });

  it("clearing the quantity is how an unquantified line is produced", async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn(idle);
    renderSheet({ updateAction });

    await user.clear(screen.getByLabelText("Menge"));
    await user.click(screen.getByRole("button", { name: "Fertig" }));

    const formData = updateAction.mock.calls[0][1] as FormData;
    expect(formData.get("quantity")).toBe("");
  });

  it("removes the line", async () => {
    const user = userEvent.setup();
    const removeAction = vi.fn(idle);
    renderSheet({ removeAction });

    await user.click(screen.getByRole("button", { name: "Entfernen" }));

    const formData = removeAction.mock.calls[0][1] as FormData;
    expect(formData.get("recipeItemId")).toBe(milch.id);
  });

  it("renders a German validation error inline", () => {
    renderSheet({
      initialState: { error: "Menge muss eine positive Zahl sein", ok: false, recipeId: null },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Menge muss eine positive Zahl sein");
  });
});
