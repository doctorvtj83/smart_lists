// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ListEntry } from "./EntryRow";
import { ListBody } from "./ListBody";
import { ENTRY_FORM_IDLE } from "./formState";

const entry = (id: string, name: string, category: string | null): ListEntry => ({
  id,
  name,
  quantity: null,
  unit: null,
  category,
  checked: false,
});

const milch = entry("11111111-1111-4111-8111-111111111111", "Milch", "Molkerei");
const butter = entry("22222222-2222-4222-8222-222222222222", "Butter", "Molkerei");
const apfel = entry("33333333-3333-4333-8333-333333333333", "Apfel", "Obst & Gemüse");
const duebel = entry("44444444-4444-4444-8444-444444444444", "Dübel", null);

function renderBody(overrides: Partial<Parameters<typeof ListBody>[0]> = {}) {
  const props = {
    entries: [milch, butter, apfel, duebel],
    articles: [
      { id: "a1", name: "Milch", defaultCategory: "Molkerei" },
      { id: "a2", name: "Milchreis", defaultCategory: null },
    ],
    categories: ["Molkerei", "Obst & Gemüse"],
    frozen: false,
    addAction: vi.fn(async () => ENTRY_FORM_IDLE),
    updateAction: vi.fn(async () => ENTRY_FORM_IDLE),
    checkAction: vi.fn(),
    removeAction: vi.fn(),
    ...overrides,
  };
  return { ...render(<ListBody {...props} />), props };
}

describe("ListBody — chips", () => {
  it("derives the chip row from the entries, Alle first and Ohne Kategorie last", () => {
    renderBody();
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["Alle", "Molkerei", "Obst & Gemüse", "Ohne Kategorie"]);
  });

  it("groups under uppercase section labels in the Alle view", () => {
    renderBody();
    expect(screen.getByRole("heading", { name: "Molkerei" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ohne Kategorie" })).toBeInTheDocument();
  });

  it("shows only the picked category and drops the section labels", async () => {
    renderBody();

    await userEvent.click(screen.getByRole("tab", { name: "Molkerei" }));

    expect(screen.getByText("Milch")).toBeInTheDocument();
    expect(screen.queryByText("Apfel")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Molkerei" })).not.toBeInTheDocument();
  });

  // The design is explicit: the user stays in the emptied filter.
  it("keeps the active chip and explains the empty category", async () => {
    const { rerender, props } = renderBody();

    await userEvent.click(screen.getByRole("tab", { name: "Obst & Gemüse" }));
    // The entry is gone on the next server render.
    rerender(<ListBody {...props} entries={[milch, butter, duebel]} />);

    expect(screen.getByRole("tab", { name: "Obst & Gemüse" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Nichts mehr in „Obst & Gemüse“")).toBeInTheDocument();
  });
});

describe("ListBody — trailing row", () => {
  it("invites the first entry on an empty list", () => {
    renderBody({ entries: [] });
    expect(screen.getByLabelText("Eintrag hinzufügen")).toBeInTheDocument();
    expect(
      screen.getByText("Einfach lostippen — jeder Eintrag mit ↵ legt gleich die nächste Zeile an."),
    ).toBeInTheDocument();
  });

  it("names the active category in the placeholder", async () => {
    renderBody();

    await userEvent.click(screen.getByRole("tab", { name: "Molkerei" }));

    expect(screen.getByLabelText("Neu in „Molkerei“")).toBeInTheDocument();
  });

  it("adds the typed name with a client-generated id", async () => {
    const addAction = vi.fn(async () => ENTRY_FORM_IDLE);
    renderBody({ addAction });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "Dübel{Enter}");

    expect(addAction).toHaveBeenCalledTimes(1);
    const formData = addAction.mock.calls[0][1] as FormData;
    expect(formData.get("name")).toBe("Dübel");
    expect(String(formData.get("itemId"))).toMatch(/^[0-9a-f-]{36}$/i);
    // "Alle" is active, so no category is posted — the catalog default wins.
    expect(formData.get("category")).toBeNull();
  });

  it("posts the active chip as the category", async () => {
    const addAction = vi.fn(async () => ENTRY_FORM_IDLE);
    renderBody({ addAction });

    await userEvent.click(screen.getByRole("tab", { name: "Molkerei" }));
    await userEvent.type(screen.getByLabelText("Neu in „Molkerei“"), "Quark{Enter}");

    const formData = addAction.mock.calls[0][1] as FormData;
    expect(formData.get("category")).toBe("Molkerei");
  });

  it("clears the field after adding", async () => {
    renderBody();

    const field = screen.getByLabelText("Eintrag hinzufügen");
    await userEvent.type(field, "Dübel{Enter}");

    expect(field).toHaveValue("");
  });

  it("suggests catalog articles while typing", async () => {
    renderBody();

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "Milc");

    expect(screen.getByRole("button", { name: /Milchreis/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "„Milc“ neu anlegen" })).toBeInTheDocument();
  });
});

describe("ListBody — entry interaction", () => {
  it("checks an entry through the action", async () => {
    const checkAction = vi.fn();
    renderBody({ checkAction });

    await userEvent.click(screen.getByRole("button", { name: "Milch abhaken" }));

    const formData = checkAction.mock.calls[0][0] as FormData;
    expect(formData.get("itemId")).toBe(milch.id);
    expect(formData.get("checked")).toBe("true");
  });

  it("opens the entry sheet from a row", async () => {
    renderBody();

    await userEvent.click(screen.getByRole("button", { name: "Milch bearbeiten" }));

    expect(screen.getByRole("dialog", { name: "Milch" })).toBeInTheDocument();
  });

  // Mirrors CatalogBrowser: the sheet closes only when the action returns ok.
  // ENTRY_FORM_IDLE has ok:false, so a success stub must set ok:true explicitly.
  it("sends one field per change and closes the sheet", async () => {
    const updateAction = vi.fn(async () => ({ ...ENTRY_FORM_IDLE, ok: true }));
    renderBody({ updateAction });

    await userEvent.click(screen.getByRole("button", { name: "Milch bearbeiten" }));
    await userEvent.type(screen.getByLabelText("Einheit"), "l");
    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    const formData = updateAction.mock.calls[0][1] as FormData;
    expect(formData.get("itemId")).toBe(milch.id);
    expect(formData.get("unit")).toBe("l");
    expect(formData.has("quantity")).toBe(false);
    expect(formData.has("category")).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // A FAILED save must keep the sheet open so the inline message is visible.
  it("keeps the sheet open and shows the error when the update fails", async () => {
    const updateAction = vi.fn(async () => ({
      error: "Menge muss eine positive Zahl sein",
      ok: false,
      openEntryId: null,
      itemId: milch.id,
    }));
    renderBody({ updateAction });

    await userEvent.click(screen.getByRole("button", { name: "Milch bearbeiten" }));
    await userEvent.type(screen.getByLabelText("Menge"), "xyz");
    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));

    expect(screen.getByRole("dialog", { name: "Milch" })).toBeInTheDocument();
    expect(await screen.findByText("Menge muss eine positive Zahl sein")).toBeInTheDocument();
  });

  // CatalogBrowser paints editState.error only when articleId matches the open
  // row — same rule here via itemId, so a failure cannot follow the user.
  it("does not carry a failed-update error to another entry's sheet", async () => {
    const updateAction = vi.fn(async () => ({
      error: "Menge muss eine positive Zahl sein",
      ok: false,
      openEntryId: null,
      itemId: milch.id,
    }));
    renderBody({ updateAction });

    await userEvent.click(screen.getByRole("button", { name: "Milch bearbeiten" }));
    await userEvent.type(screen.getByLabelText("Menge"), "xyz");
    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));
    expect(await screen.findByText("Menge muss eine positive Zahl sein")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Butter bearbeiten" }));

    expect(screen.getByRole("dialog", { name: "Butter" })).toBeInTheDocument();
    expect(screen.queryByText("Menge muss eine positive Zahl sein")).not.toBeInTheDocument();
  });

  it("removes an entry from the sheet", async () => {
    const removeAction = vi.fn();
    renderBody({ removeAction });

    await userEvent.click(screen.getByRole("button", { name: "Milch bearbeiten" }));
    await userEvent.click(screen.getByRole("button", { name: "Eintrag löschen" }));

    const formData = removeAction.mock.calls[0][0] as FormData;
    expect(formData.get("itemId")).toBe(milch.id);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // The design's "neuer, unbekannter Artikel ohne Kategorie" rule.
  // Couples openEntryId to the client-generated itemId and the revalidated entry.
  it("opens the sheet on the entry the action asks for", async () => {
    let createdId: string | null = null;
    const addAction = vi.fn(async (_prev: unknown, formData: FormData) => {
      createdId = String(formData.get("itemId"));
      return {
        ...ENTRY_FORM_IDLE,
        openEntryId: createdId,
      };
    });
    const { rerender, props } = renderBody({
      // No pre-existing "Quark" — the sheet must open for the NEW id, not a fixture.
      entries: [milch, butter, apfel],
      addAction,
    });

    await userEvent.type(screen.getByLabelText("Eintrag hinzufügen"), "Quark{Enter}");

    expect(createdId).toMatch(/^[0-9a-f-]{36}$/i);
    // Stand-in for revalidatePath: the created entry arrives with that client id.
    rerender(
      <ListBody
        {...props}
        entries={[milch, butter, apfel, entry(createdId!, "Quark", null)]}
        addAction={addAction}
      />,
    );

    expect(await screen.findByRole("dialog", { name: "Quark" })).toBeInTheDocument();
  });
});

describe("ListBody — completed list", () => {
  it("shows neither chips nor an input row", () => {
    renderBody({ frozen: true });

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Eintrag hinzufügen")).not.toBeInTheDocument();
  });

  it("still lists every entry, grouped", () => {
    renderBody({ frozen: true });

    expect(screen.getByText("Milch")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Molkerei" })).toBeInTheDocument();
  });
});
