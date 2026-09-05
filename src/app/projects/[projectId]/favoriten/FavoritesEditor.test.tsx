// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from "vitest";
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

// Keeps every render on the new project-addressed prop contract while allowing
// individual tests to replace only the action or favorite data they exercise.
function props(overrides: Partial<Parameters<typeof FavoritesEditor>[0]> = {}) {
  return {
    favorites: [milch, brot],
    projectId: "project-1",
    addAction: vi.fn(),
    removeAction: vi.fn(),
    ...overrides,
  };
}

// Centralizes the routine component render so behavior tests stay focused on
// their user-visible assertion rather than repeating setup details.
function renderEditor(overrides: Partial<Parameters<typeof FavoritesEditor>[0]> = {}) {
  const componentProps = props(overrides);
  return { ...render(<FavoritesEditor {...componentProps} />), props: componentProps };
}

describe("FavoritesEditor", () => {
  beforeEach(() => {
    // Preserve the catalog fixture the pre-Slice-8 tests used to receive as a
    // prop; those tests should now exercise the same rows through the endpoint.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "c1", name: "Milch", defaultCategory: "Molkerei", defaultUnit: "l" },
          { id: "c2", name: "Milchreis", defaultCategory: null, defaultUnit: null },
        ],
      }),
    );
  });

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

    expect(await screen.findByRole("button", { name: /Milchreis/ })).toBeInTheDocument();
  });

  it("offers suggestions fetched for the typed query", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "c1", name: "Milch", defaultCategory: "Molkerei", defaultUnit: "l" },
        ],
      }),
    );

    render(<FavoritesEditor {...props()} />);
    await user.type(screen.getByLabelText("Artikelname"), "mil");

    expect(await screen.findByRole("button", { name: /Milch/ })).toBeDefined();
  });

  it("adds the picked article as a favourite", async () => {
    const addAction = vi.fn();
    renderEditor({ addAction });

    await userEvent.type(screen.getByLabelText("Artikelname"), "Milc");
    await userEvent.click(await screen.findByRole("button", { name: /Milchreis/ }));

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
