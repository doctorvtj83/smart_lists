// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CatalogArticle } from "@/lib/catalog/manage";
import { CatalogEditPanel } from "./CatalogEditPanel";

const article: CatalogArticle = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Milch",
  defaultCategory: "Molkerei",
  defaultUnit: "l",
  usedInListCount: 0,
  isFavorite: false,
};

function renderPanel(overrides: Partial<Parameters<typeof CatalogEditPanel>[0]> = {}) {
  const props = {
    article,
    error: null,
    formAction: vi.fn(),
    onConfirmDelete: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { ...render(<CatalogEditPanel {...props} />), props };
}

describe("CatalogEditPanel", () => {
  it("shows the article's current name and defaults in editable fields", () => {
    renderPanel();

    expect(screen.getByLabelText("Name")).toHaveValue("Milch");
    expect(screen.getByLabelText("Standard-Kategorie")).toHaveValue("Molkerei");
    expect(screen.getByLabelText("Einheit")).toHaveValue("l");
  });

  it("renders empty fields for an article without defaults", () => {
    renderPanel({ article: { ...article, defaultCategory: null, defaultUnit: null } });

    expect(screen.getByLabelText("Standard-Kategorie")).toHaveValue("");
    expect(screen.getByLabelText("Einheit")).toHaveValue("");
  });

  it("puts the collision error on the name field", () => {
    renderPanel({ error: "Artikel existiert bereits" });

    expect(screen.getByText("Artikel existiert bereits")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  });

  it("carries the article id into the form so the action knows its target", () => {
    const { container } = renderPanel();
    expect(container.querySelector('input[name="catalogItemId"]')).toHaveValue(article.id);
  });

  it("offers Löschen for an article no list uses", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Löschen" })).toBeInTheDocument();
  });

  // The handoff forbids disabling a forbidden control — it must not be rendered,
  // and the reason is stated instead.
  it("hides Löschen and states the reason for an article that is in use", () => {
    renderPanel({ article: { ...article, usedInListCount: 3 } });

    expect(screen.queryByRole("button", { name: "Löschen" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Löschen nicht möglich — wird in 3 Listen verwendet."),
    ).toBeInTheDocument();
  });

  it("warns that deleting a favourite also drops it from the favourites", () => {
    renderPanel({ article: { ...article, isFavorite: true } });

    expect(
      screen.getByText("Ist ein Favorit — wird beim Löschen auch aus den Favoriten entfernt."),
    ).toBeInTheDocument();
  });

  it("asks for confirmation before deleting", async () => {
    const { props } = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(screen.getByRole("dialog", { name: "Artikel löschen: Milch" })).toBeInTheDocument();
    expect(props.onConfirmDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /^Artikel löschen/ }));
    expect(props.onConfirmDelete).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Abbrechen is clicked", async () => {
    const { props } = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});
