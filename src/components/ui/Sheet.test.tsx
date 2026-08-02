// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
  it("renders nothing while closed", () => {
    render(
      <Sheet open={false} onClose={() => {}} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a modal dialog labelled by its German title", () => {
    render(
      <Sheet open onClose={() => {}} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );

    const dialog = screen.getByRole("dialog", { name: "Neue Liste" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Inhalt")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the dim overlay is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );

    await userEvent.click(screen.getByTestId("sheet-overlay"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the panel itself is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );

    await userEvent.click(screen.getByText("Inhalt"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks background scrolling while open and restores it on close", () => {
    const { rerender } = render(
      <Sheet open onClose={() => {}} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Sheet open={false} onClose={() => {}} title="Neue Liste">
        <p>Inhalt</p>
      </Sheet>,
    );
    expect(document.body.style.overflow).toBe("");
  });
});
