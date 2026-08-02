// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ChevronRight } from "lucide-react";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("renders the glyph with the project's stroke width and size", () => {
    const { container } = render(<Icon icon={ChevronRight} />);
    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("stroke-width", "1.75");
    expect(svg).toHaveAttribute("width", "17");
  });

  it("is hidden from assistive technology because icons are decorative here", () => {
    const { container } = render(<Icon icon={ChevronRight} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("accepts a size override for the larger glyphs", () => {
    const { container } = render(<Icon icon={ChevronRight} size={24} />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "24");
  });
});
