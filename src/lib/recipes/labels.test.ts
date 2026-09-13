import { describe, expect, it } from "vitest";
import { recipeLabels } from "./labels";

describe("recipeLabels", () => {
  it("composes every string from the project's default pair", () => {
    const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

    expect(labels.singular).toBe("Rezept");
    expect(labels.plural).toBe("Rezepte");
    expect(labels.navEntry).toBe("Rezepte");
    expect(labels.newOne).toBe("Neues Rezept");
    expect(labels.addToList).toBe("Rezept hinzufügen");
    expect(labels.fromList).toBe("Rezept aus Liste anlegen");
    expect(labels.renameOne).toBe("Rezept umbenennen");
    expect(labels.deleteOne).toBe("Rezept löschen");
  });

  it("composes every string from a project's own wording", () => {
    const labels = recipeLabels({ recipeLabelSingular: "Set", recipeLabelPlural: "Sets" });

    expect(labels.singular).toBe("Set");
    expect(labels.navEntry).toBe("Sets");
    expect(labels.newOne).toBe("Neues Set");
    expect(labels.addToList).toBe("Set hinzufügen");
    expect(labels.fromList).toBe("Set aus Liste anlegen");
    expect(labels.renameOne).toBe("Set umbenennen");
    expect(labels.deleteOne).toBe("Set löschen");
  });

  it("falls back to the defaults for blank or whitespace-only labels", () => {
    // A blank column would otherwise render "Neues " — a label the settings form
    // is supposed to prevent, but the column is free text and a seed or an import
    // can still produce it.
    const labels = recipeLabels({ recipeLabelSingular: "   ", recipeLabelPlural: "" });

    expect(labels.singular).toBe("Rezept");
    expect(labels.plural).toBe("Rezepte");
  });

  it("trims stored labels rather than rendering the padding", () => {
    const labels = recipeLabels({ recipeLabelSingular: " Set ", recipeLabelPlural: " Sets " });

    expect(labels.newOne).toBe("Neues Set");
    expect(labels.plural).toBe("Sets");
  });
});
