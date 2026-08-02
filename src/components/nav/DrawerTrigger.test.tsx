// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DrawerContext, type DrawerControls } from "./DrawerContext";
import { DrawerTrigger } from "./DrawerTrigger";

function renderTrigger(controls: Partial<DrawerControls> = {}) {
  const value: DrawerControls = {
    isOpen: false,
    open: vi.fn(),
    close: vi.fn(),
    ...controls,
  };
  render(
    <DrawerContext.Provider value={value}>
      <DrawerTrigger />
    </DrawerContext.Provider>,
  );
  return value;
}

describe("DrawerTrigger", () => {
  it("is a button named „Menü öffnen“", () => {
    renderTrigger();

    expect(screen.getByRole("button", { name: "Menü öffnen" })).toBeInTheDocument();
  });

  it("opens the drawer when tapped", async () => {
    const open = vi.fn();
    renderTrigger({ open });

    await userEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));

    expect(open).toHaveBeenCalledTimes(1);
  });

  // A trigger rendered outside the shell is a wiring bug, and a silent no-op
  // button is the worst way to find out.
  it("throws when rendered without a provider", () => {
    // React logs the thrown error; silence it so the suite output stays readable.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<DrawerTrigger />)).toThrow(/DrawerContext/);
    spy.mockRestore();
  });
});
