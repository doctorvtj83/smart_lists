// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { recipeLabels } from "@/lib/recipes/labels";
import type { RecipeSummary } from "@/lib/recipes/recipes";
import { RecipeIndex } from "./RecipeIndex";
import { RECIPE_FORM_IDLE, type RecipeFormState } from "./formState";

const lasagne: RecipeSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Lasagne",
  itemCount: 6,
};
const chili: RecipeSummary = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Chili sin Carne",
  itemCount: 0,
};

const idle = async (): Promise<RecipeFormState> => RECIPE_FORM_IDLE;
const defaultLabels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

function renderIndex(overrides: Partial<Parameters<typeof RecipeIndex>[0]> = {}) {
  const props = {
    projectId: "p1",
    recipes: [lasagne, chili],
    labels: defaultLabels,
    createAction: idle,
    ...overrides,
  };
  return { ...render(<RecipeIndex {...props} />), props };
}

describe("RecipeIndex", () => {
  it("lists every recipe with its article count and a link to its detail screen", () => {
    renderIndex();

    const row = screen.getByRole("link", { name: /Lasagne/ });
    expect(row).toHaveAttribute(
      "href",
      "/projects/p1/rezepte/11111111-1111-4111-8111-111111111111",
    );
    expect(screen.getByText("6 Artikel")).toBeInTheDocument();
    // An empty recipe is a normal intermediate state, so it says so instead of "0 Artikel".
    expect(screen.getByText("Noch keine Artikel")).toBeInTheDocument();
  });

  it("names the create control with the project's own wording", () => {
    renderIndex({
      labels: recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" }),
    });

    expect(screen.getByRole("button", { name: "Neues Set" })).toBeInTheDocument();
  });

  it("opens a name field when the create control is used", async () => {
    const user = userEvent.setup();
    renderIndex();

    await user.click(screen.getByRole("button", { name: "Neues Rezept" }));

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anlegen" })).toBeInTheDocument();
  });

  it("shows the empty state, named by the project, when there are no recipes", () => {
    renderIndex({
      recipes: [],
      labels: recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" }),
    });

    expect(screen.getByText("Noch keine Sets")).toBeInTheDocument();
  });

  it("renders the duplicate-name error inline", () => {
    renderIndex({
      initialState: {
        error: "Ein Rezept mit diesem Namen existiert bereits",
        ok: false,
        recipeId: null,
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ein Rezept mit diesem Namen existiert bereits",
    );
  });
});
