// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RowLink } from "./RowLink";

describe("RowLink", () => {
  it("is a link to the given target whose accessible name is the title", () => {
    render(<RowLink href="/projects/abc" title="Haushalt" />);

    const link = screen.getByRole("link", { name: /Haushalt/ });
    expect(link).toHaveAttribute("href", "/projects/abc");
  });

  it("shows the meta line when given", () => {
    render(<RowLink href="/projects/abc" title="Haushalt" meta="3 Listen · 4 Mitglieder" />);
    expect(screen.getByText("3 Listen · 4 Mitglieder")).toBeInTheDocument();
  });

  it("renders the leading and trailing slots", () => {
    render(
      <RowLink
        href="/projects/abc"
        title="Haushalt"
        leading={<span data-testid="leading" />}
        trailing={<span data-testid="trailing" />}
      />,
    );

    expect(screen.getByTestId("leading")).toBeInTheDocument();
    expect(screen.getByTestId("trailing")).toBeInTheDocument();
  });
});
