import type { CatalogItem, ListItem, ListStatus, PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// The wire shape of a sync delta (MVP design §4.5 "Polling-Endpunkt liefert Änderungen seit einem
// Cursor"). Everything here is plain JSON — numbers/strings/nulls — so it survives fetch().json()
// on the client with no date parsing.
// ---------------------------------------------------------------------------

// One entry, flattened for the client. The display NAME lives on the catalog item (article identity,
// MVP design §3.1), so we resolve it here; `updatedAt` is epoch-ms (the LWW timestamp, exposed so a
// future client-side store could merge on it — see design decision #4).
export interface DeltaItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  checked: boolean;
  sortIndex: number;
  updatedAt: number;
}

// A full delta response. `items` is the CHANGED bodies (the actual delta); `itemIds` is EVERY
// current entry id (so the client can detect deletions — see design decision #2); `list` is the
// always-full metadata (List has no updatedAt — decision #3); `cursor` is what to send back as
// ?since next time.
export interface ListDelta {
  list: { id: string; name: string; status: ListStatus; completedAt: number | null };
  items: DeltaItem[];
  itemIds: string[];
  cursor: number;
}

// Flattens a loaded entry (with its catalog item) into the client shape. Kept tiny and separate so
// getListDelta reads cleanly and the mapping lives in one place.
function serializeItem(item: ListItem & { catalogItem: CatalogItem }): DeltaItem {
  return {
    id: item.id,
    name: item.catalogItem.name, // article identity: the name is on the catalog row, not the entry
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    checked: item.checked,
    sortIndex: item.sortIndex,
    updatedAt: item.updatedAt.getTime(), // Date -> epoch-ms for the wire (and the cursor)
  };
}

// The sync cursor: the newest entry `updatedAt` across the given items, in epoch-ms, but NEVER below
// the incoming `since`. The monotonic guard matters because a deletion of the newest entry leaves
// only older rows — without the guard the cursor would move backward and re-send already-seen
// bodies forever. Pure and synchronous, so both getListDelta and the list page (for its render-time
// baseline) compute the cursor the exact same way from already-loaded items (DRY).
export function computeCursor(items: { updatedAt: Date }[], since = 0): number {
  let max = since;
  for (const item of items) max = Math.max(max, item.updatedAt.getTime());
  return max;
}

// Reads a list's sync delta. The caller (route handler / page) has already authorized access via
// requireListAccess, so this function does not re-check membership — it is a pure read. It always
// loads the full list (one tiny row + its items) because it must return the complete id set for
// deletion detection; the `since` filter only trims which entry BODIES are sent, not the id set.
export async function getListDelta(
  db: PrismaClient,
  listId: string,
  since?: number,
): Promise<ListDelta> {
  // findUniqueOrThrow is safe: the caller resolved the list via requireListAccess, so it exists.
  const list = await db.list.findUniqueOrThrow({
    where: { id: listId },
    include: {
      // sortIndex order keeps the returned bodies in the same order the UI renders them.
      items: { include: { catalogItem: true }, orderBy: { sortIndex: "asc" } },
    },
  });

  // Full current id set — the ONLY way the client learns an entry was removed (no tombstones,
  // design decision #2).
  const itemIds = list.items.map((item) => item.id);

  // Changed bodies: strict `> since` (decision #6 — never `>=`, which would loop). No `since` means
  // a baseline pull: send every body.
  const changed =
    since === undefined
      ? list.items
      : list.items.filter((item) => item.updatedAt.getTime() > since);

  return {
    list: {
      id: list.id,
      name: list.name,
      status: list.status,
      completedAt: list.completedAt ? list.completedAt.getTime() : null,
    },
    items: changed.map(serializeItem),
    itemIds,
    cursor: computeCursor(list.items, since),
  };
}
