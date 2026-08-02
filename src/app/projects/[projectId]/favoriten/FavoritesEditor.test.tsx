// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FavoriteArticle } from "@/lib/favorites/favorites";
import { FavoritesEditor } from "./FavoritesEditor";

const milch: FavoriteArticle = {
  catalogItemId: "c1",
  name: "Milch",
  defaultCategory: "Molkerei",
  defaultUnit: "l",
};
const brot: FavoriteArticle = {
  catalogItemId: "c2",
  name: "Brot",
  defaultCategory: null,
  defaultUnit: null,
};

function renderEditor(overrides: Partial<Parameters<typeof FavoritesEditor>[0]> = {}) {
  const props = {
    favorites: [milch, brot],
    catalogNames: ["Milch", "Brot", "Butter"],
    addAction: vi.fn(),
    removeAction: vi.fn(),
    ...overrides,
  };
  return { ...render(<FavoritesEditor {...props} />), props };
}

describe("FavoritesEditor", () => {
  it("explains what favourites do", () => {
    renderEditor();

    expect(screen.getByRole("status")).toHaveTextContent(
      /Favoriten landen automatisch in jeder vorbefüllten Liste dieses Projekts/,
    );
  });

  it("shows one chip per favourite with its own remove control", () => {
    renderEditor();

    expect(screen.getByText("Milch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Milch entfernen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Brot entfernen" })).toBeInTheDocument();
  });

  it("submits the article id when a favourite is removed", async () => {
    const removeAction = vi.fn();
    renderEditor({ removeAction });

    await userEvent.click(screen.getByRole("button", { name: "Milch entfernen" }));

    expect(removeAction).toHaveBeenCalledTimes(1);
    const formData = removeAction.mock.calls[0][0] as FormData;
    expect(formData.get("catalogItemId")).toBe(milch.catalogItemId);
  });

  it("adds a favourite by name", async () => {
    const addAction = vi.fn();
    renderEditor({ addAction });

    await userEvent.type(screen.getByLabelText("Artikelname"), "Butter");
    await userEvent.click(screen.getByRole("button", { name: "Als Favorit" }));

    const formData = addAction.mock.calls[0][0] as FormData;
    expect(formData.get("name")).toBe("Butter");
  });

  // Zero-JS autocomplete: the catalog is pre-rendered as <datalist> options, so
  // the browser filters them without a round-trip per keystroke.
  it("offers the catalog as native autocomplete options", () => {
    renderEditor();

    const field = screen.getByLabelText("Artikelname");
    const listId = field.getAttribute("list");
    expect(listId).toBeTruthy();
    const datalist = document.getElementById(listId!);
    expect(datalist?.querySelectorAll("option")).toHaveLength(3);
  });

  it("shows the empty state with the add row when there are no favourites", () => {
    renderEditor({ favorites: [] });

    expect(screen.getByText("Noch keine Favoriten")).toBeInTheDocument();
    expect(screen.getByLabelText("Artikelname")).toBeInTheDocument();
  });
});
