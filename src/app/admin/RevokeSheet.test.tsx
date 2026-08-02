// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RevokeSheet } from "./RevokeSheet";

const noop = async () => {};

function renderSheet(overrides: Partial<Parameters<typeof RevokeSheet>[0]> = {}) {
  return render(
    <RevokeSheet
      email="ben@gmail.com"
      userId="user-1"
      displayName="Ben"
      projects={[
        { projectId: "p1", name: "Haushalt", role: "member" },
        { projectId: "p2", name: "Camping", role: "owner" },
      ]}
      revokeOnlyAction={noop}
      revokeAndExcludeAction={noop}
      {...overrides}
    />,
  );
}

describe("RevokeSheet", () => {
  it("is an open dialog titled with the email", () => {
    renderSheet();
    expect(screen.getByRole("dialog", { name: "Zugang entziehen: ben@gmail.com" })).toBeInTheDocument();
  });

  it("lists every project membership with its role", () => {
    renderSheet();

    expect(screen.getByText("Haushalt")).toBeInTheDocument();
    expect(screen.getByText("Mitglied")).toBeInTheDocument();
    expect(screen.getByText("Camping")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("offers both revocation paths when the person has signed in", () => {
    renderSheet();

    expect(screen.getByRole("button", { name: /Nur Zugang entziehen/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Zugang entziehen und aus allen Projekten entfernen/ }),
    ).toBeInTheDocument();
  });

  // The design's rule: a never-signed-in person cannot be in a project, so the
  // second, irreversible path must not even be offered.
  it("offers only the plain revoke when the person has never signed in", () => {
    renderSheet({ userId: null, projects: [] });

    expect(screen.getByRole("button", { name: /^Zugang entziehen/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /aus allen Projekten entfernen/ }),
    ).not.toBeInTheDocument();
  });

  it("warns up front about projects the person owns", () => {
    renderSheet();
    expect(
      screen.getByText(/Als Owner von „Camping“ behält Ben dort in jedem Fall Zugriff\./),
    ).toBeInTheDocument();
  });

  it("omits the owner hint when the person owns nothing", () => {
    renderSheet({ projects: [{ projectId: "p1", name: "Haushalt", role: "member" }] });
    expect(screen.queryByText(/in jedem Fall Zugriff/)).not.toBeInTheDocument();
  });

  it("says so when the person is in no project at all", () => {
    renderSheet({ projects: [] });
    expect(screen.getByText("Diese Person ist in keinem Projekt.")).toBeInTheDocument();
  });

  it("carries the email and user id into the forms so the actions get their input", () => {
    const { container } = renderSheet();

    const emailInputs = container.querySelectorAll('input[name="email"]');
    expect(emailInputs.length).toBe(2);
    emailInputs.forEach((input) => expect(input).toHaveValue("ben@gmail.com"));
    expect(container.querySelector('input[name="userId"]')).toHaveValue("user-1");
  });
});
