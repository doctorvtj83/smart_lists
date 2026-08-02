// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button", () => {
  it("renders its German label as the accessible name", () => {
    render(<Button>Anlegen</Button>);
    expect(screen.getByRole("button", { name: "Anlegen" })).toBeInTheDocument();
  });

  it("defaults to type=button so it never submits a surrounding form by accident", () => {
    render(<Button>Anlegen</Button>);
    expect(screen.getByRole("button", { name: "Anlegen" })).toHaveAttribute("type", "button");
  });

  it("still accepts type=submit for server-action forms", () => {
    render(<Button type="submit">Einladen</Button>);
    expect(screen.getByRole("button", { name: "Einladen" })).toHaveAttribute("type", "submit");
  });

  it("calls onClick when pressed", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Fertig</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick while disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Fertig
      </Button>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    expect(screen.getByRole("button", { name: "Fertig" })).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps a caller-supplied className alongside its own", () => {
    render(<Button className="extern">Fertig</Button>);
    expect(screen.getByRole("button", { name: "Fertig" }).className).toContain("extern");
  });
});
