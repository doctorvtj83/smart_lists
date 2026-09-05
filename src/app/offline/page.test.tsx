// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OfflinePage from "./page";

/**
 * The screen the service worker serves when a navigation cannot reach the
 * server. It must render with no session, no props and no data — that is the
 * whole point, and it is why this test can call the page component directly.
 */
describe("offline screen", () => {
  it("explains in German that the connection is gone", () => {
    render(<OfflinePage />);
    expect(screen.getByRole("heading", { name: "Keine Verbindung" })).toBeDefined();
    expect(screen.getByText(/Sobald du wieder online bist/)).toBeDefined();
  });

  it("offers a retry action", () => {
    render(<OfflinePage />);
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeDefined();
  });
});
