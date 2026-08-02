// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListMenu } from "./ListMenu";

function renderMenu(overrides: Partial<Parameters<typeof ListMenu>[0]> = {}) {
  const props = {
    listName: "Einkauf Samstag",
    isCompleted: false,
    completeAction: vi.fn(),
    deleteAction: vi.fn(),
    ...overrides,
  };
  return { ...render(<ListMenu {...props} />), props };
}

describe("ListMenu", () => {
  it("keeps the menu closed until the trigger is tapped", () => {
    renderMenu();
    expect(screen.queryByRole("menuitem", { name: "Liste löschen" })).not.toBeInTheDocument();
  });

  it("opens the menu from the ⋮ trigger", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));

    expect(screen.getByRole("menuitem", { name: "Liste abschließen" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Liste löschen" })).toBeInTheDocument();
  });

  it("completes the list and closes the menu", async () => {
    const completeAction = vi.fn();
    renderMenu({ completeAction });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Liste abschließen" }));

    expect(completeAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  // A completed list is reopened from the green banner, not from here.
  it("hides „Liste abschließen“ on a completed list", async () => {
    renderMenu({ isCompleted: true });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));

    expect(screen.queryByRole("menuitem", { name: "Liste abschließen" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Liste löschen" })).toBeInTheDocument();
  });

  it("asks before deleting and names the list", async () => {
    const deleteAction = vi.fn();
    renderMenu({ deleteAction });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Liste löschen" }));

    expect(
      screen.getByRole("dialog", { name: "Liste löschen: Einkauf Samstag" }),
    ).toBeInTheDocument();
    expect(deleteAction).not.toHaveBeenCalled();
  });

  it("deletes only after the confirmation is chosen", async () => {
    const deleteAction = vi.fn();
    renderMenu({ deleteAction });

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Liste löschen" }));
    // ConfirmSheet puts the consequence inside the button, so the accessible
    // name is "label + description" — match the label prefix like DeleteProjectButton.
    await userEvent.click(screen.getByRole("button", { name: /^Liste endgültig löschen/ }));

    expect(deleteAction).toHaveBeenCalledTimes(1);
  });

  it("closes the menu when the backdrop is tapped", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Listenmenü" }));
    await userEvent.click(screen.getByTestId("menu-backdrop"));

    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });
});
