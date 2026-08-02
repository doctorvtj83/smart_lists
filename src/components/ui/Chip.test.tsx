// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("renders as plain text when it has no interaction", () => {
    render(<Chip>Milch</Chip>);

    expect(screen.getByText("Milch")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("becomes a button when onClick is given and reports its selected state", async () => {
    const onClick = vi.fn();
    render(
      <Chip onClick={onClick} selected>
        Molkerei
      </Chip>,
    );

    const chip = screen.getByRole("button", { name: "Molkerei" });
    expect(chip).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("reports aria-pressed=false when selectable but not selected", () => {
    render(<Chip onClick={() => {}}>Molkerei</Chip>);
    expect(screen.getByRole("button", { name: "Molkerei" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders a separate remove button with a German label", async () => {
    const onRemove = vi.fn();
    render(
      <Chip tone="outline" onRemove={onRemove} removeLabel="Milch entfernen">
        Milch
      </Chip>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Milch entfernen" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic German remove label", () => {
    render(
      <Chip tone="outline" onRemove={() => {}}>
        Milch
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "Entfernen" })).toBeInTheDocument();
  });

  it("still shows its text when struck through", () => {
    render(<Chip struck>Milch</Chip>);
    expect(screen.getByText("Milch")).toBeInTheDocument();
  });
});
