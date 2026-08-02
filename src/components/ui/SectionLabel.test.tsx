// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionLabel } from "./SectionLabel";

describe("SectionLabel", () => {
  it("renders as a heading so the screen has a real outline", () => {
    render(<SectionLabel>Projekte</SectionLabel>);
    expect(screen.getByRole("heading", { name: "Projekte" })).toBeInTheDocument();
  });
});
