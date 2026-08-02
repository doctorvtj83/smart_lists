// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import type { FormEvent } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineEdit } from "./InlineEdit";

describe("InlineEdit", () => {
  it("shows the value as a button that opens the editor", async () => {
    render(<InlineEdit value="Haushalt" label="Projektname" onSave={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));

    expect(screen.getByLabelText("Projektname")).toHaveValue("Haushalt");
  });

  it("focuses the input when the editor opens", async () => {
    render(<InlineEdit value="Haushalt" label="Projektname" onSave={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));

    expect(screen.getByLabelText("Projektname")).toHaveFocus();
  });

  it("saves the new value on Enter — exactly once", async () => {
    const onSave = vi.fn();
    render(<InlineEdit value="Haushalt" label="Projektname" onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));
    await userEvent.clear(screen.getByLabelText("Projektname"));
    await userEvent.type(screen.getByLabelText("Projektname"), "Wohnung{Enter}");

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("Wohnung");
  });

  it("prevents Enter from submitting a parent form", async () => {
    const onSave = vi.fn();
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <InlineEdit value="Haushalt" label="Projektname" onSave={onSave} />
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));
    await userEvent.clear(screen.getByLabelText("Projektname"));
    await userEvent.type(screen.getByLabelText("Projektname"), "Wohnung{Enter}");

    expect(onSave).toHaveBeenCalledWith("Wohnung");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("saves on blur", async () => {
    const onSave = vi.fn();
    render(
      <>
        <InlineEdit value="Haushalt" label="Projektname" onSave={onSave} />
        <button type="button">woanders hin</button>
      </>,
    );

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));
    await userEvent.clear(screen.getByLabelText("Projektname"));
    await userEvent.type(screen.getByLabelText("Projektname"), "Wohnung");
    await userEvent.click(screen.getByRole("button", { name: "woanders hin" }));

    expect(onSave).toHaveBeenCalledWith("Wohnung");
  });

  it("discards the edit on Escape", async () => {
    const onSave = vi.fn();
    render(<InlineEdit value="Haushalt" label="Projektname" onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));
    await userEvent.clear(screen.getByLabelText("Projektname"));
    await userEvent.type(screen.getByLabelText("Projektname"), "Wohnung{Escape}");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Haushalt/ })).toBeInTheDocument();
  });

  it("does not save an unchanged value", async () => {
    const onSave = vi.fn();
    render(<InlineEdit value="Haushalt" label="Projektname" onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));
    await userEvent.keyboard("{Enter}");

    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not save an empty value", async () => {
    const onSave = vi.fn();
    render(<InlineEdit value="Haushalt" label="Projektname" onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: /Haushalt/ }));
    await userEvent.clear(screen.getByLabelText("Projektname"));
    await userEvent.keyboard("{Enter}");

    expect(onSave).not.toHaveBeenCalled();
  });

  it("renders plain text with no editor when not editable", () => {
    render(
      <InlineEdit value="Haushalt" label="Projektname" onSave={() => {}} editable={false} />,
    );

    expect(screen.getByText("Haushalt")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows a server-side error under the field", async () => {
    render(
      <InlineEdit
        value="Milch"
        label="Name"
        onSave={() => {}}
        error="Artikel existiert bereits"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Artikel existiert bereits");
  });
});
