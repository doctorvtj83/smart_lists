// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CatalogArticle } from "@/lib/catalog/manage";
import { CatalogBrowser } from "./CatalogBrowser";
import { CATALOG_FORM_IDLE, type CatalogFormState } from "./formState";

const milch: CatalogArticle = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Milch",
  defaultCategory: "Molkerei",
  defaultUnit: "l",
  usedInListCount: 0,
  isFavorite: false,
};

const nudeln: CatalogArticle = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Nudeln",
  defaultCategory: "Trockenwaren",
  defaultUnit: null,
  usedInListCount: 2,
  isFavorite: false,
};

const idle = async (): Promise<CatalogFormState> => CATALOG_FORM_IDLE;

function renderBrowser(overrides: Partial<Parameters<typeof CatalogBrowser>[0]> = {}) {
  const props = {
    articles: [milch, nudeln],
    createAction: idle,
    editAction: idle,
    ...overrides,
  };
  return { ...render(<CatalogBrowser {...props} />), props };
}

describe("CatalogBrowser", () => {
  it("lists every article with its defaults sub line", () => {
    renderBrowser();

    expect(screen.getByRole("button", { name: /Milch/ })).toBeInTheDocument();
    expect(screen.getByText("Molkerei · l")).toBeInTheDocument();
    // Only the category is set on Nudeln, so the middle dot must not appear.
    expect(screen.getByText("Trockenwaren")).toBeInTheDocument();
  });

  // Filtering reuses normalizeName, so casing and stray whitespace never matter —
  // the same identity rule the catalog itself uses.
  it("filters the list as the user types, ignoring case", async () => {
    renderBrowser();

    await userEvent.type(screen.getByLabelText("Artikel suchen"), "mil");

    expect(screen.getByRole("button", { name: /Milch/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nudeln/ })).not.toBeInTheDocument();
  });

  // Substring, not prefix: on a management screen "nudel" should find "Vollkorn-
  // nudeln". (searchCatalog stays prefix-only — that is autocomplete.)
  it("matches anywhere in the name, not only at the start", async () => {
    renderBrowser();

    await userEvent.type(screen.getByLabelText("Artikel suchen"), "udel");

    expect(screen.getByRole("button", { name: /Nudeln/ })).toBeInTheDocument();
  });

  it("says so when the search matches nothing", async () => {
    renderBrowser();

    await userEvent.type(screen.getByLabelText("Artikel suchen"), "Zelt");

    expect(screen.getByText("Keine Treffer für „Zelt“.")).toBeInTheDocument();
  });

  it("opens the edit panel when a row is tapped", async () => {
    renderBrowser();

    await userEvent.click(screen.getByRole("button", { name: /Milch/ }));

    expect(screen.getByLabelText("Name")).toHaveValue("Milch");
    expect(screen.getByRole("button", { name: "Speichern" })).toBeInTheDocument();
  });

  it("closes the panel again on Abbrechen", async () => {
    renderBrowser();

    await userEvent.click(screen.getByRole("button", { name: /Milch/ }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(screen.queryByRole("button", { name: "Speichern" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Milch/ })).toBeInTheDocument();
  });

  it("dispatches the edit action with the delete intent once deletion is confirmed", async () => {
    // Implementation takes no parameters on purpose: the assertion reads
    // mock.calls[0][1] (the FormData React passes into useActionState).
    const editAction = vi.fn(async (): Promise<CatalogFormState> => CATALOG_FORM_IDLE);
    renderBrowser({ editAction });

    await userEvent.click(screen.getByRole("button", { name: /Milch/ }));
    await userEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await userEvent.click(screen.getByRole("button", { name: /^Artikel löschen/ }));

    expect(editAction).toHaveBeenCalledTimes(1);
    const formData = editAction.mock.calls[0][1] as FormData;
    expect(formData.get("intent")).toBe("delete");
    expect(formData.get("catalogItemId")).toBe(milch.id);
  });

  it("shows the create error next to the create field", async () => {
    const createAction = async (): Promise<CatalogFormState> => ({
      error: "Artikel existiert bereits",
      ok: false,
      createdId: null,
      articleId: null,
    });
    renderBrowser({ createAction });

    await userEvent.type(screen.getByLabelText("Neuen Artikel anlegen"), "Milch");
    await userEvent.click(screen.getByRole("button", { name: "Artikel anlegen" }));

    expect(await screen.findByText("Artikel existiert bereits")).toBeInTheDocument();
  });

  // Handoff: creating „legt an und öffnet direkt das Bearbeiten-Panel".
  // The stub returns the id of an article ALREADY in `articles`, standing in for
  // the revalidated props a real create would produce — otherwise there would be
  // no row for the returned id to open.
  it("opens the panel of a freshly created article", async () => {
    const createAction = async (): Promise<CatalogFormState> => ({
      error: null,
      ok: true,
      createdId: nudeln.id,
      articleId: nudeln.id,
    });
    renderBrowser({ createAction });

    await userEvent.type(screen.getByLabelText("Neuen Artikel anlegen"), "Nudeln");
    await userEvent.click(screen.getByRole("button", { name: "Artikel anlegen" }));

    // The panel's presence is the assertion — not a display value, which would
    // also match the text still sitting in the create field.
    expect(await screen.findByRole("button", { name: "Speichern" })).toBeInTheDocument();
  });

  it("shows the empty state and no search field for an empty catalog", () => {
    renderBrowser({ articles: [] });

    expect(screen.getByText("Der Katalog füllt sich von selbst")).toBeInTheDocument();
    expect(screen.getByLabelText("Neuen Artikel anlegen")).toBeInTheDocument();
    expect(screen.queryByLabelText("Artikel suchen")).not.toBeInTheDocument();
  });
});
