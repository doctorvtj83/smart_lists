// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  it("is a switch carrying its German label as the accessible name", () => {
    render(<Toggle checked={false} onChange={() => {}} label="Vorbefüllen" />);

    expect(screen.getByRole("switch", { name: "Vorbefüllen" })).toBeInTheDocument();
  });

  it("reports its state through aria-checked", () => {
    const { rerender } = render(<Toggle checked={false} onChange={() => {}} label="Vorbefüllen" />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");

    rerender(<Toggle checked onChange={() => {}} label="Vorbefüllen" />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("reports the NEXT state on click, not a toggle command", async () => {
    const onChange = vi.fn();
    render(<Toggle checked onChange={onChange} label="Vorbefüllen" />);

    await userEvent.click(screen.getByRole("switch"));

    expect(onChange).toHaveBeenCalledWith(false);
  });
});
