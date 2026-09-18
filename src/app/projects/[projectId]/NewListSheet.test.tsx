// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SuggestedArticle } from "@/lib/suggestions/suggestions";
import { recipeLabels } from "@/lib/recipes/labels";
import { NewListSheet } from "./NewListSheet";

const milch: SuggestedArticle = {
  catalogItemId: "c1",
  name: "Milch",
  defaultCategory: "Molkerei",
  defaultUnit: "l",
};
const brot: SuggestedArticle = {
  catalogItemId: "c2",
  name: "Brot",
  defaultCategory: null,
  defaultUnit: null,
};
const nudeln: SuggestedArticle = {
  catalogItemId: "c3",
  name: "Nudeln",
  defaultCategory: null,
  defaultUnit: null,
};

function renderSheet(overrides: Partial<Parameters<typeof NewListSheet>[0]> = {}) {
  const props = {
    suggestions: [milch, brot, nudeln],
    favoriteIds: [milch.catalogItemId],
    recipes: [],
    labels: null,
    heroTitle: "Vorbefüllte Liste anlegen",
    heroSubtitle: "Startet mit Favoriten + häufigen Artikeln",
    createAction: vi.fn(),
    ...overrides,
  };
  return { ...render(<NewListSheet {...props} />), props };
}

/** Opens the hero card's sheet — every step-2 test starts here. */
async function openSheet() {
  // The hero concatenates title + subtitle into one accessible name, so an exact
  // „Vorbefüllte Liste anlegen" match misses it. The start-anchored regex still
  // uniquely identifies the hero: submit buttons end in „anlegen" but never start
  // with the hero title.
  await userEvent.click(screen.getByRole("button", { name: /^Vorbefüllte Liste anlegen/ }));
}

describe("NewListSheet", () => {
  it("opens the sheet from the hero card", async () => {
    renderSheet();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    expect(screen.getByRole("dialog", { name: "Neue Liste" })).toBeInTheDocument();
  });

  it("counts every suggestion in the button label by default", async () => {
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    expect(screen.getByRole("button", { name: "Liste mit 3 Einträgen anlegen" })).toBeInTheDocument();
  });

  it("drops a single article from the selection and recounts", async () => {
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    await userEvent.click(screen.getByRole("button", { name: /Brot/ }));

    expect(screen.getByRole("button", { name: "Liste mit 2 Einträgen anlegen" })).toBeInTheDocument();
  });

  it("toggles aria-pressed when a prefill chip is clicked", async () => {
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    const brotChip = screen.getByRole("button", { name: /Brot/ });
    expect(brotChip).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(brotChip);
    expect(brotChip).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(brotChip);
    expect(brotChip).toHaveAttribute("aria-pressed", "true");
  });

  it("puts a dropped article back when tapped again", async () => {
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    await userEvent.click(screen.getByRole("button", { name: /Brot/ }));
    await userEvent.click(screen.getByRole("button", { name: /Brot/ }));

    expect(screen.getByRole("button", { name: "Liste mit 3 Einträgen anlegen" })).toBeInTheDocument();
  });

  // Switching pre-fill off is a different intent from de-selecting everything:
  // it also hides the preview.
  it("turns the whole pre-fill off and relabels the button", async () => {
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    await userEvent.click(screen.getByRole("switch", { name: "Vorbefüllen" }));

    expect(screen.getByRole("button", { name: "Leere Liste anlegen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Milch/ })).not.toBeInTheDocument();
  });

  it("says „Leere Liste anlegen“ when every suggestion was dropped", async () => {
    renderSheet({ suggestions: [milch], favoriteIds: [] });
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    await userEvent.click(screen.getByRole("button", { name: /Milch/ }));

    expect(screen.getByRole("button", { name: "Leere Liste anlegen" })).toBeInTheDocument();
  });

  // The hidden fields ARE the contract with the Server Action, so they are
  // asserted through the submitted FormData rather than through the DOM.
  it("submits the name and exactly the surviving articles", async () => {
    const createAction = vi.fn();
    renderSheet({ createAction });
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    await userEvent.type(screen.getByLabelText("Listenname"), "Einkauf");
    await userEvent.click(screen.getByRole("button", { name: /Brot/ }));
    await userEvent.click(screen.getByRole("button", { name: "Liste mit 2 Einträgen anlegen" }));

    expect(createAction).toHaveBeenCalledTimes(1);
    const formData = createAction.mock.calls[0][0] as FormData;
    expect(formData.get("name")).toBe("Einkauf");
    expect(formData.getAll("articleName")).toEqual(["Milch", "Nudeln"]);
  });

  it("submits no articles at all when pre-fill is off", async () => {
    const createAction = vi.fn();
    renderSheet({ createAction });
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    await userEvent.type(screen.getByLabelText("Listenname"), "Baumarkt");
    await userEvent.click(screen.getByRole("switch", { name: "Vorbefüllen" }));
    await userEvent.click(screen.getByRole("button", { name: "Leere Liste anlegen" }));

    const formData = createAction.mock.calls[0][0] as FormData;
    expect(formData.getAll("articleName")).toEqual([]);
  });

  // With nothing to pre-fill there is no preview and no switch — the sheet
  // collapses to "name a list".
  it("hides the pre-fill controls when the project has no suggestions yet", async () => {
    renderSheet({ suggestions: [], favoriteIds: [] });
    await userEvent.click(screen.getByRole("button", { name: /Vorbefüllte Liste anlegen/ }));

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leere Liste anlegen" })).toBeInTheDocument();
  });
});

const labels = recipeLabels({ recipeLabelSingular: "Rezept", recipeLabelPlural: "Rezepte" });

const RECIPES = [
  {
    id: "r1",
    name: "Lasagne",
    articles: [
      { catalogItemId: "c-milch", name: "Milch" },
      { catalogItemId: "c-hack", name: "Hackfleisch" },
    ],
  },
  { id: "r2", name: "Chili", articles: [{ catalogItemId: "c-bohnen", name: "Bohnen" }] },
];

describe("NewListSheet — Schritt 2", () => {
  it("stays a one-pane sheet when the project has no recipes", async () => {
    renderSheet();

    await openSheet();

    // The step-1 button is still the commit button — there is nothing to step to.
    expect(screen.queryByRole("button", { name: "Weiter" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Liste mit/ })).toBeInTheDocument();
  });

  it("stays a one-pane sheet when the feature is off, even if recipes exist", async () => {
    renderSheet({ recipes: RECIPES, labels: null });

    await openSheet();

    expect(screen.queryByRole("button", { name: "Weiter" })).not.toBeInTheDocument();
  });

  it("offers „Weiter“ into the recipe pane when the feature is on", async () => {
    renderSheet({ recipes: RECIPES, labels });

    await openSheet();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));

    expect(screen.getByRole("spinbutton", { name: "Anzahl Lasagne" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Anzahl Chili" })).toBeInTheDocument();
  });

  it("returns to step 1 and keeps what was typed", async () => {
    renderSheet({ recipes: RECIPES, labels });

    await openSheet();
    await userEvent.type(screen.getByRole("textbox", { name: "Listenname" }), "Samstag");
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));

    expect(screen.getByRole("textbox", { name: "Listenname" })).toHaveValue("Samstag");
  });

  it("counts articles de-duplicated across recipes and pre-fill", async () => {
    // The suggestion set contains Milch, which Lasagne also brings. 2 recipe articles + 2
    // suggestions − 1 overlap = 3.
    renderSheet({
      recipes: RECIPES,
      labels,
      suggestions: [
        { catalogItemId: "c-milch", name: "Milch", defaultCategory: null, defaultUnit: null },
        { catalogItemId: "c-brot", name: "Brot", defaultCategory: null, defaultUnit: null },
      ],
    });

    await openSheet();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" }));

    expect(screen.getByRole("button", { name: "Liste anlegen · 3 Artikel" })).toBeInTheDocument();
  });

  it("names the overlap instead of striking the step-1 chips", async () => {
    renderSheet({
      recipes: RECIPES,
      labels,
      suggestions: [
        { catalogItemId: "c-milch", name: "Milch", defaultCategory: null, defaultUnit: null },
      ],
    });

    await openSheet();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" }));

    expect(
      screen.getByText(
        "Milch kommt schon aus den Rezepten und wird nicht doppelt hinzugefügt.",
      ),
    ).toBeInTheDocument();
  });

  it("posts the chosen recipes, the surviving suggestions and an apply token", async () => {
    let received: FormData | null = null;
    const createAction = vi.fn((formData: FormData) => {
      received = formData;
    });
    renderSheet({
      recipes: RECIPES,
      labels,
      createAction,
      suggestions: [
        { catalogItemId: "c-brot", name: "Brot", defaultCategory: null, defaultUnit: null },
      ],
    });

    await openSheet();
    await userEvent.type(screen.getByRole("textbox", { name: "Listenname" }), "Samstag");
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await userEvent.click(screen.getByRole("button", { name: "Anzahl Chili erhöhen" }));
    await userEvent.click(screen.getByRole("button", { name: /^Liste anlegen · / }));

    expect(received!.get("name")).toBe("Samstag");
    expect(received!.getAll("articleName")).toEqual(["Brot"]);
    expect(received!.getAll("selection")).toEqual(["r2:1"]);
    expect(String(received!.get("applyToken"))).not.toBe("");
  });
});
