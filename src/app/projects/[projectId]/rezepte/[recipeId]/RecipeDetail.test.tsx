// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { recipeLabels } from "@/lib/recipes/labels";
import { RecipeDetail, type RecipeLine } from "./RecipeDetail";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "../formState";

const lines: RecipeLine[] = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Hackfleisch", quantity: 500, unit: "g" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Milch", quantity: 1.5, unit: "l" },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Salz", quantity: null, unit: null },
];

const idle = async (): Promise<RecipeFormState> => RECIPE_FORM_IDLE;
const defaultLabels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

function renderDetail(overrides: Partial<Parameters<typeof RecipeDetail>[0]> = {}) {
  const props = {
    projectId: "p1",
    recipeId: "11111111-1111-4111-8111-111111111111",
    lines,
    labels: defaultLabels,
    addLineAction: idle,
    updateLineAction: idle,
    removeLineAction: idle,
    ...overrides,
  };
  return { ...render(<RecipeDetail {...props} />), props };
}

// The dropdown fetches per keystroke; jsdom has no fetch worth exercising here.
vi.mock("@/components/ui/useCatalogSearch", () => ({ useCatalogSearch: () => [] }));

describe("RecipeDetail", () => {
  it("renders each line with its German quantity label", () => {
    renderDetail();

    expect(screen.getByText("Hackfleisch")).toBeInTheDocument();
    expect(screen.getByText("500 g")).toBeInTheDocument();
    // German decimal comma (handoff §2), via formatQuantityLabel.
    expect(screen.getByText("1,5 l")).toBeInTheDocument();
  });

  it("marks an unquantified line instead of printing an empty label", () => {
    renderDetail();

    // Salz has no quantity — the design's "—" placeholder, so the column still lines up.
    const salzRow = screen.getByRole("button", { name: /Salz/ });
    expect(salzRow).toHaveTextContent("—");
  });

  it("offers the trailing add row", () => {
    renderDetail();

    expect(screen.getByLabelText("Artikel hinzufügen")).toBeInTheDocument();
  });

  it("submits the typed text to the add action", async () => {
    const user = userEvent.setup();
    const addLineAction = vi.fn(idle);
    renderDetail({ addLineAction });

    await user.type(screen.getByLabelText("Artikel hinzufügen"), "500 g Hackfleisch");
    await user.keyboard("{Enter}");

    // The SERVER parses the quantity (addRecipeItemFromRow) — the row only sends the raw text.
    expect(addLineAction).toHaveBeenCalled();
    const formData = addLineAction.mock.calls[0][1] as FormData;
    expect(formData.get("text")).toBe("500 g Hackfleisch");
  });

  it("opens the line sheet when a line is tapped", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("button", { name: /Hackfleisch/ }));

    expect(screen.getByRole("dialog", { name: "Hackfleisch" })).toBeInTheDocument();
    expect(screen.getByLabelText("Menge")).toHaveValue("500");
  });

  it("closes the line sheet after Fertig succeeds", async () => {
    const user = userEvent.setup();
    const updateLineAction = vi.fn(async (): Promise<RecipeFormState> => ({
      error: null,
      ok: true,
      recipeId: "11111111-1111-4111-8111-111111111111",
    }));
    renderDetail({ updateLineAction });

    await user.click(screen.getByRole("button", { name: /Hackfleisch/ }));
    await user.click(screen.getByRole("button", { name: "Fertig" }));

    expect(screen.queryByRole("dialog", { name: "Hackfleisch" })).not.toBeInTheDocument();
  });

  it("shows an empty state naming the project's own wording", () => {
    renderDetail({
      lines: [],
      labels: recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" }),
    });

    expect(screen.getByText("Noch keine Artikel in diesem Set")).toBeInTheDocument();
  });
});
