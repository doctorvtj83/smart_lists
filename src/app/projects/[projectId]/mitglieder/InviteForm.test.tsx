// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InviteForm, INVITE_FORM_IDLE, type InviteFormState } from "./InviteForm";

describe("InviteForm", () => {
  it("submits the typed email", async () => {
    const action = vi.fn(async (): Promise<InviteFormState> => INVITE_FORM_IDLE);
    render(<InviteForm action={action} />);

    await userEvent.type(screen.getByLabelText("E-Mail-Adresse"), "anna@web.de");
    await userEvent.click(screen.getByRole("button", { name: "Einladen" }));

    const formData = action.mock.calls[0][1] as FormData;
    expect(formData.get("email")).toBe("anna@web.de");
  });

  // The domain throws "Nutzer nicht gefunden – …" for someone who has never
  // signed in. That must land next to the field, not as a crash overlay.
  it("paints the German error next to the field", async () => {
    const action = async (): Promise<InviteFormState> => ({
      error: "Nutzer nicht gefunden – die Person muss sich zuerst einmal anmelden.",
    });
    render(<InviteForm action={action} />);

    await userEvent.type(screen.getByLabelText("E-Mail-Adresse"), "niemand@web.de");
    await userEvent.click(screen.getByRole("button", { name: "Einladen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Nutzer nicht gefunden/);
  });

  it("explains the allowlist rule", () => {
    render(<InviteForm action={async () => INVITE_FORM_IDLE} />);

    expect(
      screen.getByText("Nur freigeschaltete E-Mail-Adressen können eingeladen werden."),
    ).toBeInTheDocument();
  });
});
