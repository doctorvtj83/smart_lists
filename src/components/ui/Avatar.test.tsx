// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("shows the first letter of the name, uppercased", () => {
    render(<Avatar name="haushalt" />);
    expect(screen.getByText("H")).toBeInTheDocument();
  });

  it("is hidden from assistive technology because the name is always next to it", () => {
    const { container } = render(<Avatar name="Haushalt" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("renders an empty circle instead of crashing on an empty name", () => {
    const { container } = render(<Avatar name="" />);
    expect(container.firstElementChild).toBeInTheDocument();
  });
});
