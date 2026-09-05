// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCatalogSearch } from "./useCatalogSearch";

/**
 * The hook is the transport half of the autocomplete. Its contract is small and
 * every part of it is a bug the user would feel: a request per keystroke drains
 * a phone, a late response overwriting a newer one shows the wrong suggestions,
 * and a request for an empty field is pure waste.
 */
describe("useCatalogSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function stubFetch(payload: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("never asks the server about an empty query", async () => {
    const fetchMock = stubFetch([]);
    const { result } = renderHook(() => useCatalogSearch("p1", "   "));

    await vi.advanceTimersByTimeAsync(500);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it("fetches the project's catalog for the typed query", async () => {
    const fetchMock = stubFetch([
      { id: "c1", name: "Milch", defaultCategory: "Molkerei", defaultUnit: "l" },
    ]);
    const { result } = renderHook(() => useCatalogSearch("p1", "mil"));

    await vi.advanceTimersByTimeAsync(200);

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p1/catalog?q=mil",
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(result.current[0]).toMatchObject({ name: "Milch", defaultUnit: "l" });
  });

  it("debounces a burst of keystrokes into one request", async () => {
    const fetchMock = stubFetch([]);
    const { rerender } = renderHook(({ query }) => useCatalogSearch("p1", query), {
      initialProps: { query: "m" },
    });

    rerender({ query: "mi" });
    rerender({ query: "mil" });
    await vi.advanceTimersByTimeAsync(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p1/catalog?q=mil",
      expect.anything(),
    );
  });

  it("percent-encodes a query so an umlaut or a space cannot break the URL", async () => {
    const fetchMock = stubFetch([]);
    renderHook(() => useCatalogSearch("p1", "rote bete"));

    await vi.advanceTimersByTimeAsync(200);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p1/catalog?q=rote%20bete",
      expect.anything(),
    );
  });

  it("keeps the previous page while a new query is in flight", async () => {
    stubFetch([{ id: "c1", name: "Milch", defaultCategory: null, defaultUnit: null }]);
    const { result, rerender } = renderHook(({ query }) => useCatalogSearch("p1", query), {
      initialProps: { query: "mil" },
    });

    await vi.advanceTimersByTimeAsync(200);
    await waitFor(() => expect(result.current).toHaveLength(1));

    // A dropdown that empties itself on every keystroke flickers; holding the
    // last page until the next one lands is what makes it feel instant.
    rerender({ query: "milc" });
    expect(result.current).toHaveLength(1);
  });
});
