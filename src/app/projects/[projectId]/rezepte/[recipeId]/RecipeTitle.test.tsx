// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { recipeLabels } from "@/lib/recipes/labels";
import { RecipeTitle } from "./RecipeTitle";

const labels = recipeLabels({
  recipeLabelSingular: "Rezept",
  recipeLabelPlural: "Rezepte",
});

describe("RecipeTitle", () => {
  it("shows a duplicate-name error returned by the rename action", async () => {
    const user = userEvent.setup();
    const renameAction = vi.fn(async () => "Rezept existiert bereits");
    render(<RecipeTitle name="Bolognese" labels={labels} renameAction={renameAction} />);

    await user.click(screen.getByRole("button", { name: "Bolognese" }));
    await user.clear(screen.getByLabelText("Rezeptname"));
    await user.type(screen.getByLabelText("Rezeptname"), "Lasagne{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Rezept existiert bereits");
  });
});
