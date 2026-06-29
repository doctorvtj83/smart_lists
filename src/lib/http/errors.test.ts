import { describe, expect, it } from "vitest";
import { ApiError, toErrorResponse } from "./errors";

describe("ApiError", () => {
  it("carries a status and message", () => {
    const e = new ApiError(403, "kein zugriff");
    expect(e.status).toBe(403);
    expect(e.message).toBe("kein zugriff");
  });
});

describe("toErrorResponse", () => {
  it("maps an ApiError to a response with its status and message", async () => {
    const res = toErrorResponse(new ApiError(404, "nicht gefunden"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "nicht gefunden" });
  });

  it("maps an unknown error to a generic 500", async () => {
    const res = toErrorResponse(new Error("boom"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Fehler" });
  });
});
