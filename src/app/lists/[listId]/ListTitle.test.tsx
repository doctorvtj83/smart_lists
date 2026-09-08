// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListTitle } from "./ListTitle";

// F3: mirrors ProjectTitle.test.tsx — same InlineEdit wiring, but list rename is
// member-level (MVP design §6 groups it with create/complete/delete, all ✓ for
// Mitglied), so there is no "member sees plain text" branch to cover here.
describe("ListTitle", () => {
  it("renames on Enter and reports the new name", async () => {
    const renameAction = vi.fn(async () => {});
    render(<ListTitle name="Frankfurt" renameAction={renameAction} />);

    await userEvent.click(screen.getByRole("button", { name: "Frankfurt" }));
    const field = screen.getByLabelText("Listenname");
    await userEvent.clear(field);
    await userEvent.type(field, "Berlin{Enter}");

    expect(renameAction).toHaveBeenCalledWith("Berlin");
  });
});
