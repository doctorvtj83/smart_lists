// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ListSyncPoller, { POLL_INTERVAL_MS } from "./ListSyncPoller";

// The poller calls useRouter().refresh() on change; a stub is enough — this test never asserts refresh.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("ListSyncPoller overlapping-poll guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not start a second request while the first is still in flight", async () => {
    // A fetch that never settles simulates one request outliving multiple interval ticks.
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ListSyncPoller
        listId="list-1"
        initialCursor={0}
        initialItemIds={[]}
        initialList={{ name: "L", status: "active", completedAt: null }}
      />,
    );

    // Advance past two interval ticks. Without the guard, tick 1 and tick 2 both call fetch.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2 + 10);

    // With the guard, the second tick sees the first request still pending and skips.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
