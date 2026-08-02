// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextField } from "./TextField";

describe("TextField", () => {
  it("links the label to the input so clicking the label focuses it", async () => {
    render(<TextField label="Projektname" />);

    await userEvent.click(screen.getByText("Projektname"));

    expect(screen.getByLabelText("Projektname")).toHaveFocus();
  });

  it("renders without a label when none is given", () => {
    render(<TextField placeholder="Artikel suchen…" />);
    expect(screen.getByPlaceholderText("Artikel suchen…")).toBeInTheDocument();
  });

  it("accepts typed input", async () => {
    render(<TextField label="Projektname" />);

    await userEvent.type(screen.getByLabelText("Projektname"), "Haushalt");

    expect(screen.getByLabelText("Projektname")).toHaveValue("Haushalt");
  });

  it("shows the German error message and marks the input invalid", () => {
    render(<TextField label="Name" error="Artikel existiert bereits" />);

    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Artikel existiert bereits");
  });

  it("points aria-describedby at the error so screen readers announce it", () => {
    render(<TextField label="Name" error="Artikel existiert bereits" />);

    const input = screen.getByLabelText("Name");
    const describedBy = input.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      "Artikel existiert bereits",
    );
  });

  it("has no error element and no aria-invalid when valid", () => {
    render(<TextField label="Name" />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
  });

  it("forwards a name attribute so server-action forms can read it", () => {
    render(<TextField label="E-Mail-Adresse" name="email" />);
    expect(screen.getByLabelText("E-Mail-Adresse")).toHaveAttribute("name", "email");
  });

  it("keeps error aria wiring even when the caller passes conflicting aria props", () => {
    render(
      <TextField
        label="Name"
        error="Artikel existiert bereits"
        aria-invalid={false}
        aria-describedby="some-other-id"
      />,
    );

    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toMatch(/-error$/);
    expect(document.getElementById(input.getAttribute("aria-describedby") as string)).toHaveTextContent(
      "Artikel existiert bereits",
    );
  });
});
