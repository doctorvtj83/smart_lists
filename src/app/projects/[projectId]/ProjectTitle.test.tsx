// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectTitle } from "./ProjectTitle";

describe("ProjectTitle", () => {
  it("renames on Enter and reports the new name", async () => {
    const renameAction = vi.fn(async () => {});
    render(<ProjectTitle name="Haushalt" editable renameAction={renameAction} />);

    await userEvent.click(screen.getByRole("button", { name: "Haushalt" }));
    const field = screen.getByLabelText("Projektname");
    await userEvent.clear(field);
    await userEvent.type(field, "Wohnung{Enter}");

    expect(renameAction).toHaveBeenCalledWith("Wohnung");
  });

  // Owner-only controls are NOT rendered for members (handoff § Destruktive
  // Aktionen / Inline-Editing: "nur wo editierbar").
  it("shows a member plain text with no editing affordance", () => {
    render(<ProjectTitle name="Haushalt" editable={false} renameAction={async () => {}} />);

    expect(screen.getByText("Haushalt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Haushalt" })).not.toBeInTheDocument();
  });
});
