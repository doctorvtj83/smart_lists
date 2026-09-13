// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeSettingsForm } from "./RecipeSettingsForm";
import { SETTINGS_FORM_IDLE, type SettingsFormState } from "./formState";

const idle = async (): Promise<SettingsFormState> => SETTINGS_FORM_IDLE;

function renderForm(overrides: Partial<Parameters<typeof RecipeSettingsForm>[0]> = {}) {
  const props = {
    recipesEnabled: false,
    recipeLabelSingular: "Rezept",
    recipeLabelPlural: "Rezepte",
    saveAction: idle,
    ...overrides,
  };
  return { ...render(<RecipeSettingsForm {...props} />), props };
}

describe("RecipeSettingsForm", () => {
  it("shows the switch off and the default wording pre-filled", () => {
    renderForm();

    expect(screen.getByRole("switch", { name: "Rezepte aktivieren" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByLabelText("Einzahl")).toHaveValue("Rezept");
    expect(screen.getByLabelText("Mehrzahl")).toHaveValue("Rezepte");
  });

  it("reflects a project that already renamed the feature", () => {
    renderForm({ recipesEnabled: true, recipeLabelSingular: "Set", recipeLabelPlural: "Sets" });

    expect(screen.getByRole("switch", { name: "Sets aktivieren" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Einzahl")).toHaveValue("Set");
  });

  it("toggles the switch and keeps the label fields editable while off", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("switch", { name: "Rezepte aktivieren" }));
    expect(screen.getByRole("switch", { name: "Rezepte aktivieren" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // The wording survives switching off, so the fields must never be disabled by the toggle.
    await user.click(screen.getByRole("switch", { name: "Rezepte aktivieren" }));
    await user.clear(screen.getByLabelText("Einzahl"));
    await user.type(screen.getByLabelText("Einzahl"), "Set");
    expect(screen.getByLabelText("Einzahl")).toHaveValue("Set");
  });

  it("surfaces a failed save inline", () => {
    renderForm({
      initialState: { error: "Bezeichnung darf höchstens 40 Zeichen lang sein", ok: false },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Bezeichnung darf höchstens 40 Zeichen lang sein",
    );
  });

  it("confirms a successful save", () => {
    renderForm({ initialState: { error: null, ok: true } });

    expect(screen.getByRole("status")).toHaveTextContent("Gespeichert");
  });
});
