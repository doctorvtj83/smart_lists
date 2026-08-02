// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { DrawerTrigger } from "./DrawerTrigger";
import { ProjectShell } from "./ProjectShell";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

const noop = async () => {};

function renderShell() {
  return render(
    <ProjectShell
      nav={{
        projectId: "p1",
        projectName: "Haushalt",
        projects: [{ id: "p1", name: "Haushalt" }],
        activeListCount: 3,
        memberCount: 4,
        isAdmin: false,
      }}
      signOutAction={noop}
    >
      {/* Stands in for a screen: a page's PageHeader leading slot. */}
      <DrawerTrigger />
      <p>Screen-Inhalt</p>
    </ProjectShell>,
  );
}

describe("ProjectShell", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/projects/p1");
  });

  it("renders the screen and the permanent sidebar navigation", () => {
    renderShell();

    expect(screen.getByText("Screen-Inhalt")).toBeInTheDocument();
    // The sidebar is always in the DOM; CSS hides it below 900px.
    expect(screen.getByRole("navigation", { name: "Projektnavigation" })).toBeInTheDocument();
  });

  it("opens a second, modal navigation when the trigger is tapped", async () => {
    renderShell();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));

    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    expect(drawer).toBeInTheDocument();
    // Sidebar + drawer now both render the panel.
    expect(screen.getAllByRole("navigation", { name: "Projektnavigation" })).toHaveLength(2);
  });

  it("closes the drawer on Escape", async () => {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the drawer when the dim overlay is tapped", async () => {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));

    await userEvent.click(screen.getByTestId("drawer-overlay"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Tapping a nav entry navigates; leaving the drawer open over the new screen
  // would hide the very thing the user asked for.
  it("closes the drawer when a nav entry inside it is tapped", async () => {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Menü öffnen" }));

    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    const archiv = within(drawer).getByRole("link", { name: /Archiv/ });
    await userEvent.click(archiv);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
