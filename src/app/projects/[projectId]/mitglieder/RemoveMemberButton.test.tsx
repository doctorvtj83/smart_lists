// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RemoveMemberButton } from "./RemoveMemberButton";

function renderButton(removeAction = vi.fn()) {
  render(<RemoveMemberButton memberLabel="Ben" userId="u2" removeAction={removeAction} />);
  return removeAction;
}

describe("RemoveMemberButton", () => {
  it("names the member it would remove", async () => {
    renderButton();

    await userEvent.click(screen.getByRole("button", { name: "Entfernen" }));

    expect(screen.getByRole("dialog", { name: "Mitglied entfernen: Ben" })).toBeInTheDocument();
  });

  it("does not remove before the sheet is confirmed", async () => {
    const removeAction = renderButton();

    await userEvent.click(screen.getByRole("button", { name: "Entfernen" }));

    expect(removeAction).not.toHaveBeenCalled();
  });

  it("submits the user id once confirmed", async () => {
    const removeAction = renderButton();

    await userEvent.click(screen.getByRole("button", { name: "Entfernen" }));
    await userEvent.click(screen.getByRole("button", { name: /^Aus dem Projekt entfernen/ }));

    expect(removeAction).toHaveBeenCalledTimes(1);
    const formData = removeAction.mock.calls[0][0] as FormData;
    expect(formData.get("userId")).toBe("u2");
  });
});
