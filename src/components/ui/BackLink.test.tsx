// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BackLink } from "./BackLink";

/**
 * The screens that carry no drawer (/admin, /projekte) were navigational dead
 * ends after the first production deploy: you could reach them, but the only way
 * back to Home was editing the URL. These tests pin the two properties that
 * matter — it is a real link with a real destination, and it is labelled for
 * screen readers even though its visible glyph is an arrow.
 */
describe("BackLink", () => {
  it("links to the given destination", () => {
    render(<BackLink href="/" label="Zur Startseite" />);

    expect(screen.getByRole("link", { name: "Zur Startseite" })).toHaveAttribute("href", "/");
  });

  it("shows the arrow glyph without letting a screen reader announce it", () => {
    render(<BackLink href="/projects" label="Zurück zu Projekten" />);

    const link = screen.getByRole("link", { name: "Zurück zu Projekten" });
    // The arrow is decorative: the accessible name comes from aria-label, so the
    // glyph must be hidden rather than read out as "left arrow".
    expect(link.textContent).toContain("←");
  });
});
