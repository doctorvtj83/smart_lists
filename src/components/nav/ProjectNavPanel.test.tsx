// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { ProjectNavPanel } from "./ProjectNavPanel";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

const noop = async () => {};

function renderPanel(overrides: Partial<Parameters<typeof ProjectNavPanel>[0]> = {}) {
  const props = {
    projectId: "p1",
    projectName: "Haushalt",
    projects: [
      { id: "p1", name: "Haushalt" },
      { id: "p2", name: "Camping" },
    ],
    activeListCount: 3,
    memberCount: 4,
    isAdmin: false,
    signOutAction: noop,
    ...overrides,
  };
  return { ...render(<ProjectNavPanel {...props} />), props };
}

describe("ProjectNavPanel", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/projects/p1");
  });

  it("links to all five project screens with their counts", () => {
    renderPanel();

    expect(screen.getByRole("link", { name: /Listen/ })).toHaveAttribute("href", "/projects/p1");
    expect(screen.getByRole("link", { name: /Archiv/ })).toHaveAttribute(
      "href",
      "/projects/p1/archiv",
    );
    expect(screen.getByRole("link", { name: /Favoriten/ })).toHaveAttribute(
      "href",
      "/projects/p1/favoriten",
    );
    expect(screen.getByRole("link", { name: /Katalog/ })).toHaveAttribute(
      "href",
      "/projects/p1/katalog",
    );
    expect(screen.getByRole("link", { name: /Mitglieder/ })).toHaveAttribute(
      "href",
      "/projects/p1/mitglieder",
    );
    // The two counts the design puts on the right of a nav row.
    expect(screen.getByRole("link", { name: /Listen/ })).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: /Mitglieder/ })).toHaveTextContent("4");
  });

  // aria-current is how the "white pill" active state is exposed to assistive
  // tech — the class name itself is never asserted.
  it("marks the current screen, and only that one", () => {
    vi.mocked(usePathname).mockReturnValue("/projects/p1/katalog");
    renderPanel();

    expect(screen.getByRole("link", { name: /Katalog/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Listen/ })).not.toHaveAttribute("aria-current");
  });

  it("treats the bare project path as Listen, not as a prefix of every screen", () => {
    vi.mocked(usePathname).mockReturnValue("/projects/p1");
    renderPanel();

    expect(screen.getByRole("link", { name: /Listen/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Archiv/ })).not.toHaveAttribute("aria-current");
  });

  it("opens the project switcher and lists every project, ticking the active one", async () => {
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /Projekt wechseln/ }));

    const camping = screen.getByRole("link", { name: /Camping/ });
    expect(camping).toHaveAttribute("href", "/projects/p2");
    // The ✓ is on the project you are already in.
    expect(screen.getByRole("link", { name: /Haushalt/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Neues Projekt…" })).toHaveAttribute(
      "href",
      "/projects",
    );
  });

  it("hides Verwaltung from non-admins and shows it to admins", () => {
    const { unmount } = renderPanel({ isAdmin: false });
    expect(screen.queryByRole("link", { name: "Verwaltung" })).not.toBeInTheDocument();
    unmount();

    renderPanel({ isAdmin: true });
    expect(screen.getByRole("link", { name: "Verwaltung" })).toHaveAttribute("href", "/admin");
  });

  it("always offers Abmelden", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "Abmelden" })).toBeInTheDocument();
  });

  // The mobile drawer must close behind a tapped link; the desktop sidebar passes
  // no callback and therefore stays put.
  it("reports a navigation so the drawer can close itself", async () => {
    const onNavigate = vi.fn();
    renderPanel({ onNavigate });

    await userEvent.click(screen.getByRole("link", { name: /Archiv/ }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
