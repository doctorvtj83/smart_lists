// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders the title as a heading and the sentence below it", () => {
    render(
      <EmptyState
        icon={<span data-testid="glyph" />}
        title="Noch keine Favoriten"
        description="Favoriten landen automatisch in jeder vorbefüllten Liste."
      />,
    );

    expect(screen.getByRole("heading", { name: "Noch keine Favoriten" })).toBeInTheDocument();
    expect(
      screen.getByText("Favoriten landen automatisch in jeder vorbefüllten Liste."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("glyph")).toBeInTheDocument();
  });

  it("renders the action slot so the next step sits right under the sentence", () => {
    render(
      <EmptyState icon={<span />} title="Noch kein Projekt" description="Leg eins an.">
        <button type="button">Anlegen</button>
      </EmptyState>,
    );

    expect(screen.getByRole("button", { name: "Anlegen" })).toBeInTheDocument();
  });

  it("works without an action", () => {
    render(
      <EmptyState
        icon={<span />}
        title="Noch nichts abgeschlossen"
        description="Abgeschlossene Listen landen hier."
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
  });
});
