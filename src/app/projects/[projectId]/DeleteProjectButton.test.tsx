// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteProjectButton } from "./DeleteProjectButton";

describe("DeleteProjectButton", () => {
  it("does not delete before the sheet is confirmed", async () => {
    const deleteAction = vi.fn(async () => {});
    render(<DeleteProjectButton projectName="Haushalt" deleteAction={deleteAction} />);

    await userEvent.click(screen.getByRole("button", { name: "Projekt löschen…" }));

    expect(screen.getByRole("dialog", { name: /Projekt löschen: Haushalt/ })).toBeInTheDocument();
    expect(deleteAction).not.toHaveBeenCalled();
  });

  it("deletes once the destructive option is chosen", async () => {
    const deleteAction = vi.fn(async () => {});
    render(<DeleteProjectButton projectName="Haushalt" deleteAction={deleteAction} />);

    await userEvent.click(screen.getByRole("button", { name: "Projekt löschen…" }));
    await userEvent.click(screen.getByRole("button", { name: /^Projekt endgültig löschen/ }));

    expect(deleteAction).toHaveBeenCalledTimes(1);
  });

  it("closes again on Abbrechen without deleting", async () => {
    const deleteAction = vi.fn(async () => {});
    render(<DeleteProjectButton projectName="Haushalt" deleteAction={deleteAction} />);

    await userEvent.click(screen.getByRole("button", { name: "Projekt löschen…" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteAction).not.toHaveBeenCalled();
  });
});
