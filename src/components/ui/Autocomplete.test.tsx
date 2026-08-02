// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Autocomplete } from "./Autocomplete";

const options = [
  { id: "a1", name: "Milch", hint: "· Molkerei" },
  { id: "a2", name: "Milchreis", hint: "" },
];

function renderField(overrides: Partial<Parameters<typeof Autocomplete>[0]> = {}) {
  const props = {
    value: "",
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    options: [],
    createName: null,
    placeholder: "Eintrag hinzufügen",
    inputLabel: "Eintrag hinzufügen",
    ...overrides,
  };
  return { ...render(<Autocomplete {...props} />), props };
}

describe("Autocomplete", () => {
  it("shows no dropdown while there is nothing to suggest", () => {
    renderField();
    expect(screen.queryByRole("button", { name: /Milch/ })).not.toBeInTheDocument();
  });

  it("reports every keystroke to the caller", async () => {
    const onChange = vi.fn();
    renderField({ onChange });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "M");

    expect(onChange).toHaveBeenCalledWith("M");
  });

  it("submits the typed text on Enter", async () => {
    const onSubmit = vi.fn();
    renderField({ value: "Dübel", onSubmit });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("Dübel");
  });

  it("submits the article name when a suggestion is tapped", async () => {
    const onSubmit = vi.fn();
    renderField({ value: "Mil", options, onSubmit });

    await userEvent.click(screen.getByRole("button", { name: /Milchreis/ }));

    expect(onSubmit).toHaveBeenCalledWith("Milchreis");
  });

  it("shows the create row and submits the offered name", async () => {
    const onSubmit = vi.fn();
    renderField({ value: "Dübel", createName: "Dübel", onSubmit });

    await userEvent.click(screen.getByRole("button", { name: "„Dübel“ neu anlegen" }));

    expect(onSubmit).toHaveBeenCalledWith("Dübel");
  });

  it("hides the dropdown on Escape and brings it back on the next keystroke", async () => {
    const { rerender, props } = renderField({ value: "Mil", options });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "{Escape}");
    expect(screen.queryByRole("button", { name: /Milchreis/ })).not.toBeInTheDocument();

    rerender(<Autocomplete {...props} value="Milc" options={options} />);
    expect(screen.getByRole("button", { name: /Milchreis/ })).toBeInTheDocument();
  });

  it("renders the leading slot next to the input", () => {
    renderField({ leading: <span>＋</span> });
    expect(screen.getByText("＋")).toBeInTheDocument();
  });

  it("does not submit an empty field", async () => {
    const onSubmit = vi.fn();
    renderField({ value: "   ", onSubmit });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
