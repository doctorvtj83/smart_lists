// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders its text", () => {
    render(<Badge>OWNER</Badge>);
    expect(screen.getByText("OWNER")).toBeInTheDocument();
  });
});
