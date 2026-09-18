// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Stepper } from "./Stepper";

describe("Stepper", () => {
  it("exposes the current value to assistive technology", () => {
    render(<Stepper value={2} onChange={vi.fn()} label="Anzahl Lasagne" />);

    const spin = screen.getByRole("spinbutton", { name: "Anzahl Lasagne" });
    expect(spin).toHaveAttribute("aria-valuenow", "2");
    expect(spin).toHaveAttribute("aria-valuemin", "0");
    expect(spin).toHaveAttribute("aria-valuemax", "99");
    expect(spin).toHaveTextContent("2");
  });

  it("reports the NEXT value when + is tapped", async () => {
    const onChange = vi.fn();
    render(<Stepper value={2} onChange={onChange} label="Anzahl Lasagne" />);

    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" }));

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("reports the NEXT value when − is tapped", async () => {
    const onChange = vi.fn();
    render(<Stepper value={2} onChange={onChange} label="Anzahl Lasagne" />);

    await userEvent.click(screen.getByRole("button", { name: "Anzahl Lasagne verringern" }));

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("disables − at the minimum, so 0 can never become -1", () => {
    render(<Stepper value={0} onChange={vi.fn()} label="Anzahl Lasagne" />);

    expect(screen.getByRole("button", { name: "Anzahl Lasagne verringern" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" })).toBeEnabled();
  });

  it("disables + at the maximum", () => {
    render(<Stepper value={99} onChange={vi.fn()} label="Anzahl Lasagne" />);

    expect(screen.getByRole("button", { name: "Anzahl Lasagne erhöhen" })).toBeDisabled();
  });

  it("honours a caller-supplied range", () => {
    render(<Stepper value={1} onChange={vi.fn()} label="Anzahl" min={1} max={5} />);

    const spin = screen.getByRole("spinbutton", { name: "Anzahl" });
    expect(spin).toHaveAttribute("aria-valuemin", "1");
    expect(spin).toHaveAttribute("aria-valuemax", "5");
    expect(screen.getByRole("button", { name: "Anzahl verringern" })).toBeDisabled();
  });
});
