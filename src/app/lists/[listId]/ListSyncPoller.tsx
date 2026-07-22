"use client";

// The project's FIRST client component. Everything else is server-rendered with server actions; this
// is the one piece that needs the browser (a timer + fetch). It renders nothing — it is a pure
// side-effect: poll the delta endpoint and, when something changed, refresh the server component.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Poll cadence for an open list (MVP design §4.5: "~1–3 s"). 2s balances freshness against request
// volume on a phone; exported so any tuning has a single source of truth.
export const POLL_INTERVAL_MS = 2000;

// The list-metadata subset we compare to detect rename / complete / reopen. List has no updatedAt
// (design decision #3), so we compare the values directly rather than a timestamp.
interface ListMeta {
  name: string;
  status: string;
  completedAt: number | null;
}

interface ListSyncPollerProps {
  listId: string;
  // The cursor + id set + metadata AS RENDERED by the server component. Polling starts from here so
  // a change made between this render and the first poll is still detected.
  initialCursor: number;
  initialItemIds: string[];
  initialList: ListMeta;
}

// Cheap unordered string-set equality. The id set is how we detect an add OR a delete (remove_item
// leaves no tombstone — design decision #2), so we need to compare sets, not sequences.
function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export default function ListSyncPoller({
  listId,
  initialCursor,
  initialItemIds,
  initialList,
}: ListSyncPollerProps) {
  const router = useRouter();

  // Baselines are refs, NOT state: advancing them must not re-render (this component renders null).
  // They hold "the last server truth we have already reflected on screen".
  const cursorRef = useRef(initialCursor);
  const itemIdsRef = useRef(initialItemIds);
  const metaRef = useRef(initialList);

  useEffect(() => {
    // Guards against a late fetch resolving after the component unmounted (avoids a refresh on a
    // page the user already left).
    let cancelled = false;

    async function poll() {
      // Don't poll a tab the user isn't looking at — saves battery/requests on iPhone. The next
      // visible tick picks up whatever changed in the meantime.
      if (typeof document !== "undefined" && document.hidden) return;

      try {
        const res = await fetch(`/api/lists/${listId}/delta?since=${cursorRef.current}`, {
          // Never serve a cached delta — we always want the current server truth.
          cache: "no-store",
        });
        if (!res.ok || cancelled) return; // transient error / unmounted — just try again next tick
        const delta = await res.json();

        // Did anything change vs. what is on screen? Three independent signals:
        //  - a changed/added entry body came back (updatedAt > cursor),
        //  - the id set differs (an add OR a DELETE — deletions ONLY show up here),
        //  - list metadata changed (rename / complete / reopen).
        const changed =
          delta.items.length > 0 ||
          !sameIdSet(delta.itemIds, itemIdsRef.current) ||
          delta.list.name !== metaRef.current.name ||
          delta.list.status !== metaRef.current.status ||
          delta.list.completedAt !== metaRef.current.completedAt;

        // Advance the baseline on EVERY poll so a given change is acted on once, not on every tick
        // after it (which would be a refresh loop). Next poll's ?since is now past these changes.
        cursorRef.current = delta.cursor;
        itemIdsRef.current = delta.itemIds;
        metaRef.current = delta.list;

        // Re-render the server component to pull the merged server truth. No client-side entry store
        // or optimistic UI — online LWW is enforced server-side in applyOperation; a client store +
        // offline queue is Phase 2 (design decisions #4/#5).
        if (changed) router.refresh();
      } catch {
        // Network blip — swallow and let the interval retry on the next tick.
      }
    }

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    // Cleanup: stop polling and ignore any in-flight response when the list page unmounts.
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // listId/router are stable for the life of the page; the refs carry all mutable state.
  }, [listId, router]);

  // Pure side-effect component: nothing to render.
  return null;
}
