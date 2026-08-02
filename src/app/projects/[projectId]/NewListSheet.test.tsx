// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SuggestedArticle } from "@/lib/suggestions/suggestions";
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
    heroTitle: "Vorbefüllte Liste anlegen",
    heroSubtitle: "Startet mit Favoriten + häufigen Artikeln",
    createAction: vi.fn(),
    ...overrides,
  };
  return { ...render(<NewListSheet {...props} />), props };
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
