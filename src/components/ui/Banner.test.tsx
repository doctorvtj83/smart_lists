// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Banner } from "./Banner";

describe("Banner", () => {
  it("announces itself politely as a status region", () => {
    render(<Banner tone="info">Alle Einträge sind abgehakt.</Banner>);

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Alle Einträge sind abgehakt.");
  });

  it("renders the action slot", () => {
    render(
      <Banner tone="info" action={<button type="button">Abschließen</button>}>
        Alle Einträge sind abgehakt.
      </Banner>,
    );

    expect(screen.getByRole("button", { name: "Abschließen" })).toBeInTheDocument();
  });

  it("renders the icon slot", () => {
    render(
      <Banner tone="success" icon={<span data-testid="glyph" />}>
        Abgeschlossen am 19.07.2026
      </Banner>,
    );

    expect(screen.getByTestId("glyph")).toBeInTheDocument();
  });
});
