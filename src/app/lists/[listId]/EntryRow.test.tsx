// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EntryRow, type ListEntry } from "./EntryRow";

const milch: ListEntry = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Milch",
  quantity: 1.5,
  unit: "l",
  category: "Molkerei",
  checked: false,
};

function renderRow(overrides: Partial<Parameters<typeof EntryRow>[0]> = {}) {
  const props = {
    entry: milch,
    frozen: false,
    onToggle: vi.fn(),
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return { ...render(<ul>{<EntryRow {...props} />}</ul>), props };
}

// The swipe is a pointer gesture; jsdom needs the coordinates supplied explicitly.
// fireEvent.pointer* can fail to deliver clientX in jsdom — MouseEvents with the
// pointer* type names still reach React's onPointer* handlers.
function swipe(row: HTMLElement, distance: number) {
  // Handlers live on the inner row surface (child of the data-item-id wrap); fire
  // there so the event target is inside the listener's subtree and bubbles correctly.
  const surface =
    (row.querySelector('[aria-label$="bearbeiten"]')?.parentElement as HTMLElement | null) ??
    (row.querySelector('[aria-label$="abhaken"]')?.parentElement as HTMLElement | null) ??
    row;

  fireEvent(surface, new MouseEvent("pointerdown", { clientX: 200, bubbles: true }));
  fireEvent(
    surface,
    new MouseEvent("pointermove", { clientX: 200 + distance, bubbles: true, buttons: 1 }),
  );
  fireEvent(
    surface,
    new MouseEvent("pointerup", { clientX: 200 + distance, bubbles: true }),
  );
}

describe("EntryRow", () => {
  it("shows the name and the German quantity label", () => {
    renderRow();
    expect(screen.getByText("Milch")).toBeInTheDocument();
    expect(screen.getByText("1,5 l")).toBeInTheDocument();
  });

  it("carries the entry id for tests and the future row flash", () => {
    const { container } = renderRow();
    expect(container.querySelector(`[data-item-id="${milch.id}"]`)).not.toBeNull();
  });

  it("reports the TARGET checked state, not a toggle", async () => {
    const onToggle = vi.fn();
    renderRow({ onToggle });

    await userEvent.click(screen.getByRole("button", { name: "Milch abhaken" }));

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("reports unchecking a checked entry", async () => {
    const onToggle = vi.fn();
    renderRow({ entry: { ...milch, checked: true }, onToggle });

    await userEvent.click(screen.getByRole("button", { name: "Milch abhaken" }));

    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("marks a checked entry as pressed", () => {
    renderRow({ entry: { ...milch, checked: true } });
    expect(screen.getByRole("button", { name: "Milch abhaken" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("opens the entry sheet when the row body is tapped", async () => {
    const onOpen = vi.fn();
    renderRow({ onOpen });

    await userEvent.click(screen.getByRole("button", { name: /Milch bearbeiten/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("deletes when a swipe passes the threshold", () => {
    const { props, container } = renderRow();
    const row = container.querySelector(`[data-item-id="${milch.id}"]`) as HTMLElement;

    swipe(row, -120);

    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("snaps back instead of deleting on a short swipe", () => {
    const { props, container } = renderRow();
    const row = container.querySelector(`[data-item-id="${milch.id}"]`) as HTMLElement;

    swipe(row, -30);

    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("does not open the sheet when the gesture was a swipe", () => {
    const { props, container } = renderRow();
    const row = container.querySelector(`[data-item-id="${milch.id}"]`) as HTMLElement;

    swipe(row, -120);
    fireEvent.click(screen.getByRole("button", { name: /Milch bearbeiten/ }));

    expect(props.onOpen).not.toHaveBeenCalled();
  });

  // A completed list is read-only (handoff §10: "kein Abhaken", no input row).
  it("renders a frozen entry without any controls", () => {
    renderRow({ entry: { ...milch, checked: true }, frozen: true });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Milch")).toBeInTheDocument();
  });

  it("does not delete a frozen entry on swipe", () => {
    const { props, container } = renderRow({ frozen: true });
    const row = container.querySelector(`[data-item-id="${milch.id}"]`) as HTMLElement;

    swipe(row, -200);

    expect(props.onDelete).not.toHaveBeenCalled();
  });
});
