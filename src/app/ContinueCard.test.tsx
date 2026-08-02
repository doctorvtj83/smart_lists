// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContinueCard } from "./ContinueCard";

const data = {
  listId: "list-1",
  listName: "Einkauf Samstag",
  projectId: "project-1",
  projectName: "Haushalt",
  openCount: 5,
  totalCount: 8,
};

describe("ContinueCard", () => {
  it("links to the list", () => {
    render(<ContinueCard data={data} />);

    const link = screen.getByRole("link", { name: /Einkauf Samstag/ });
    expect(link).toHaveAttribute("href", "/lists/list-1");
  });

  it("shows the project and the open counter", () => {
    render(<ContinueCard data={data} />);
    expect(screen.getByText("Haushalt · 5 von 8 offen")).toBeInTheDocument();
  });

  it("exposes progress as done-of-total, not open-of-total", () => {
    render(<ContinueCard data={data} />);

    // 5 of 8 are OPEN, so 3 of 8 are done — the bar fills with what is finished.
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "8");
  });

  it("survives an empty list", () => {
    render(<ContinueCard data={{ ...data, openCount: 0, totalCount: 0 }} />);

    expect(screen.getByText("Haushalt · 0 von 0 offen")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});
