// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmSheet } from "./ConfirmSheet";

const TITLE = "Zugang entziehen: anna@web.de";

describe("ConfirmSheet", () => {
  it("renders every option as its own button", () => {
    render(
      <ConfirmSheet
        open
        onClose={() => {}}
        title={TITLE}
        options={[
          { label: "Nur Zugang entziehen", tone: "neutral", onSelect: () => {} },
          {
            label: "Zugang entziehen und aus allen Projekten entfernen",
            tone: "danger",
            onSelect: () => {},
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: /Nur Zugang entziehen/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /aus allen Projekten entfernen/ }),
    ).toBeInTheDocument();
  });

  it("includes the consequence sentence in the option's accessible name", () => {
    render(
      <ConfirmSheet
        open
        onClose={() => {}}
        title={TITLE}
        options={[
          {
            label: "Nur Zugang entziehen",
            description: "Keine neuen Logins. Mitgliedschaften bleiben.",
            tone: "neutral",
            onSelect: () => {},
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Keine neuen Logins\. Mitgliedschaften bleiben\./ }),
    ).toBeInTheDocument();
  });

  it("calls the selected option and nothing else", async () => {
    const safe = vi.fn();
    const destructive = vi.fn();
    render(
      <ConfirmSheet
        open
        onClose={() => {}}
        title={TITLE}
        options={[
          { label: "Nur Zugang entziehen", tone: "neutral", onSelect: safe },
          { label: "Alles entfernen", tone: "danger", onSelect: destructive },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Nur Zugang entziehen" }));

    expect(safe).toHaveBeenCalledTimes(1);
    expect(destructive).not.toHaveBeenCalled();
  });

  it("closes on Abbrechen", async () => {
    const onClose = vi.fn();
    render(
      <ConfirmSheet
        open
        onClose={onClose}
        title={TITLE}
        options={[{ label: "Löschen", tone: "danger", onSelect: () => {} }]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders context passed as children above the options", () => {
    render(
      <ConfirmSheet
        open
        onClose={() => {}}
        title={TITLE}
        options={[{ label: "Löschen", tone: "danger", onSelect: () => {} }]}
      >
        <p>Mitglied in diesen Projekten:</p>
      </ConfirmSheet>,
    );

    expect(screen.getByText("Mitglied in diesen Projekten:")).toBeInTheDocument();
  });

  it("renders nothing while closed", () => {
    render(
      <ConfirmSheet
        open={false}
        onClose={() => {}}
        title={TITLE}
        options={[{ label: "Löschen", tone: "danger", onSelect: () => {} }]}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
