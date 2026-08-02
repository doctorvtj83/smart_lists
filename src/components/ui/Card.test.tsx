// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  it("renders its children", () => {
    render(
      <Card>
        <p>Inhalt</p>
      </Card>,
    );
    expect(screen.getByText("Inhalt")).toBeInTheDocument();
  });

  it("keeps a caller-supplied className so the caller controls padding", () => {
    const { container } = render(<Card className="extern">x</Card>);
    expect(container.firstElementChild?.className).toContain("extern");
  });
});
