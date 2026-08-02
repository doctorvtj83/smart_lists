// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the title as the page's level-1 heading", () => {
    render(<PageHeader title="Projekte" />);
    expect(screen.getByRole("heading", { level: 1, name: "Projekte" })).toBeInTheDocument();
  });

  it("renders the leading and trailing slots", () => {
    render(
      <PageHeader
        title="Verwaltung"
        leading={<span data-testid="leading" />}
        trailing={<span data-testid="trailing" />}
      />,
    );

    expect(screen.getByTestId("leading")).toBeInTheDocument();
    expect(screen.getByTestId("trailing")).toBeInTheDocument();
  });

  it("is a banner landmark so screen readers can jump to it", () => {
    render(<PageHeader title="Projekte" />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});
