// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Home is the first screen a brand-new account sees, and after the first
 * production deploy it was a dead end: with zero projects the "PROJEKTE" section
 * rendered a heading and nothing else. There is no drawer outside a project, so
 * the only route to the create form on /projects was typing the URL.
 *
 * These tests render the async Server Component directly (`render(await Home())`)
 * with its two reads stubbed. That is the cheapest way to pin a *navigational*
 * property — what the page offers when it has nothing to show.
 */

// The page reads the session and the database at module scope through these
// four modules; stubbing them is what makes the component renderable in jsdom.
const auth = vi.fn();
vi.mock("@/auth", () => ({
  auth: () => auth(),
  // The sign-out form's action is never submitted here, but the import must resolve.
  signOut: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));

const getContinueList = vi.fn();
const listProjectSummaries = vi.fn();
vi.mock("@/lib/lists/continue", () => ({ getContinueList: () => getContinueList() }));
vi.mock("@/lib/projects/summaries", () => ({
  listProjectSummaries: () => listProjectSummaries(),
}));

import HomePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    user: { id: "u1", email: "test@example.com", isAdmin: false },
  });
  getContinueList.mockResolvedValue(null);
});

describe("Home", () => {
  it("offers a way to create the first project when there are none", async () => {
    listProjectSummaries.mockResolvedValue([]);

    render(await HomePage());

    // The destination is what matters: /projects owns the create form, so Home
    // must not grow a second one — it only has to lead there.
    expect(screen.getByRole("link", { name: /projekt anlegen/i })).toHaveAttribute(
      "href",
      "/projects"
    );
  });

  it("lists the projects and still leads to the projects screen", async () => {
    listProjectSummaries.mockResolvedValue([
      { id: "p1", name: "Haushalt", activeListCount: 2, memberCount: 1, role: "owner" },
    ]);

    render(await HomePage());

    expect(screen.getByRole("link", { name: /Haushalt/ })).toHaveAttribute("href", "/projects/p1");
    // Once projects exist the empty state is gone, but the route to the project
    // list must survive — otherwise creating a SECOND project is unreachable
    // again for anyone who has not opened a project's drawer.
    expect(screen.getByRole("link", { name: /alle projekte/i })).toHaveAttribute(
      "href",
      "/projects"
    );
  });
});
