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
    articles: [
      { id: "c1", name: "Milch", defaultCategory: "Molkerei" },
      { id: "c2", name: "Milchreis", defaultCategory: null },
    ],
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

  // Enter on the Autocomplete field submits the typed name — there is no longer
  // a separate „Als Favorit" submit button beside the field.
  it("adds a favourite by name", async () => {
    const addAction = vi.fn();
    renderEditor({ addAction });

    const field = screen.getByLabelText("Artikelname");
    await userEvent.type(field, "Butter");
    await userEvent.keyboard("{Enter}");

    const formData = addAction.mock.calls[0][0] as FormData;
    expect(formData.get("name")).toBe("Butter");
  });

  it("suggests catalog articles while typing a favourite", async () => {
    renderEditor();

    await userEvent.type(screen.getByLabelText("Artikelname"), "Milc");

    expect(screen.getByRole("button", { name: /Milchreis/ })).toBeInTheDocument();
  });

  it("adds the picked article as a favourite", async () => {
    const addAction = vi.fn();
    renderEditor({ addAction });

    await userEvent.type(screen.getByLabelText("Artikelname"), "Milc");
    await userEvent.click(screen.getByRole("button", { name: /Milchreis/ }));

    const formData = addAction.mock.calls[0][0] as FormData;
    expect(formData.get("name")).toBe("Milchreis");
  });

  it("offers to create an unknown article as a favourite", async () => {
    const addAction = vi.fn();
    renderEditor({ addAction });

    await userEvent.type(screen.getByLabelText("Artikelname"), "Dinkelmehl");
    await userEvent.click(screen.getByRole("button", { name: "„Dinkelmehl“ neu anlegen" }));

    const formData = addAction.mock.calls[0][0] as FormData;
    expect(formData.get("name")).toBe("Dinkelmehl");
  });

  it("shows the empty state with the add row when there are no favourites", () => {
    renderEditor({ favorites: [] });

    expect(screen.getByText("Noch keine Favoriten")).toBeInTheDocument();
    expect(screen.getByLabelText("Artikelname")).toBeInTheDocument();
  });
});
