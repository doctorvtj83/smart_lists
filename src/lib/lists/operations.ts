import type { List, ListItem, PrismaClient } from "@prisma/client";
import { flowBackCatalogDefaults, getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";

// Upper bound for the short free-text fields (unit, category). Smaller than names on purpose:
// these are labels like "l", "kg", "Kühlregal" — 100 chars is already generous.
export const MAX_TEXT_FIELD_LENGTH = 100;

// ---------------------------------------------------------------------------
// Operation types — THE mutation contract of the app (MVP design §4.5).
// Every mutation is entry-granular and carries the stable, client-generated ListItem id, so
// Phase 2 can queue these exact shapes offline and replay them without API changes.
// ---------------------------------------------------------------------------

// Creates an entry. The client generates itemId (a UUID) so the entry keeps its identity across
// retries/offline replays. quantity/unit/category are optional; unset unit/category fall back to
// the article's catalog defaults (inheritance, MVP design §4.4).
export interface AddItemOperation {
  op: "add_item";
  itemId: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
}

// Field-granular update ("Feld+Wert", MVP design §4.5): exactly ONE field per operation. This
// granularity is what makes per-field last-writer-wins merge possible in Slice 7 — a coarse
// "update everything" operation would clobber concurrent edits to other fields.
// `checked` is NOT a field here: checking has its own semantic operation (check_item).
export interface UpdateItemOperation {
  op: "update_item";
  itemId: string;
  field: "quantity" | "unit" | "category" | "sortIndex";
  value: number | string | null;
}

// Checks/unchecks an entry. Carries the target state (not a toggle!) so replaying it is idempotent:
// applying "checked: true" twice ends in the same state. A toggle would flip-flop on replay.
export interface CheckItemOperation {
  op: "check_item";
  itemId: string;
  checked: boolean;
}

// Removes an entry. Idempotent by definition: removing an already-removed entry is a no-op success.
export interface RemoveItemOperation {
  op: "remove_item";
  itemId: string;
}

export type Operation =
  | AddItemOperation
  | UpdateItemOperation
  | CheckItemOperation
  | RemoveItemOperation;

// ---------------------------------------------------------------------------
// parseOperation — untrusted JSON -> typed Operation (or ApiError 400).
// ---------------------------------------------------------------------------

// The fields update_item may touch. `as const` gives us a checkable runtime list AND the literal
// union type for UpdateItemOperation["field"] from one source of truth.
const UPDATABLE_FIELDS = ["quantity", "unit", "category", "sortIndex"] as const;

// Shape-validates a request body into a typed Operation. This is the ONE place untrusted operation
// JSON is checked, so the route handler and any future transport (offline queue replay) share the
// same validation. Value/semantic validation (lengths, quantity > 0, existence) stays in
// applyOperation — parse checks shape, apply checks meaning.
export function parseOperation(body: unknown): Operation {
  // All operations are JSON objects; anything else (null, string, array) is a malformed request.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError(400, "Ungültige Operation");
  }
  // Cast to an indexable record ONCE; each branch below narrows the fields it needs.
  const raw = body as Record<string, unknown>;

  // Every operation carries the stable entry id — reject early if it's missing/not a string.
  if (typeof raw.itemId !== "string") throw new ApiError(400, "Ungültige Operation");
  const itemId = raw.itemId;

  switch (raw.op) {
    case "add_item": {
      if (typeof raw.name !== "string") throw new ApiError(400, "Ungültige Operation");
      // Optional fields: `undefined` = "not supplied" (inherit defaults), `null` = explicit empty.
      // Wrong types are rejected rather than coerced — silent coercion would hide client bugs.
      if (raw.quantity !== undefined && raw.quantity !== null && typeof raw.quantity !== "number") {
        throw new ApiError(400, "Ungültige Operation");
      }
      if (raw.unit !== undefined && raw.unit !== null && typeof raw.unit !== "string") {
        throw new ApiError(400, "Ungültige Operation");
      }
      if (raw.category !== undefined && raw.category !== null && typeof raw.category !== "string") {
        throw new ApiError(400, "Ungültige Operation");
      }
      return {
        op: "add_item",
        itemId,
        name: raw.name,
        quantity: raw.quantity as number | null | undefined,
        unit: raw.unit as string | null | undefined,
        category: raw.category as string | null | undefined,
      };
    }
    case "update_item": {
      // `includes` needs the widened type; the cast back to the literal union is safe after the check.
      if (!UPDATABLE_FIELDS.includes(raw.field as (typeof UPDATABLE_FIELDS)[number])) {
        throw new ApiError(400, "Ungültige Operation");
      }
      const value = raw.value;
      if (value !== null && typeof value !== "number" && typeof value !== "string") {
        throw new ApiError(400, "Ungültige Operation");
      }
      return {
        op: "update_item",
        itemId,
        field: raw.field as UpdateItemOperation["field"],
        value: value as number | string | null,
      };
    }
    case "check_item": {
      if (typeof raw.checked !== "boolean") throw new ApiError(400, "Ungültige Operation");
      return { op: "check_item", itemId, checked: raw.checked };
    }
    case "remove_item":
      return { op: "remove_item", itemId };
    default:
      throw new ApiError(400, "Ungültige Operation");
  }
}

// ---------------------------------------------------------------------------
// applyOperation — dispatch + semantics (idempotency, inheritance, validation).
// ---------------------------------------------------------------------------

// Validates a quantity value: must be a finite number > 0 (or null to clear). NaN/Infinity survive
// JSON parsing via server actions, and 0/negative quantities are meaningless on a list.
function assertValidQuantity(value: number | null | undefined): void {
  if (value === null || value === undefined) return;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ApiError(400, "Menge muss eine positive Zahl sein");
  }
}

// Validates a short text field (unit/category): null clears it, strings are length-capped.
function assertValidTextField(value: string | null | undefined, label: string): void {
  if (value === null || value === undefined) return;
  if (value.length > MAX_TEXT_FIELD_LENGTH) {
    throw new ApiError(400, `${label} darf höchstens ${MAX_TEXT_FIELD_LENGTH} Zeichen lang sein`);
  }
}

// Applies ONE operation to a list and returns the resulting entry (null after remove_item).
// The caller (route handler / server action) has already authorized access to `list` via
// requireListAccess and passes the loaded row — so this core never re-checks permissions, and the
// list is known to exist. Takes the full List (not just the id) because add_item needs
// list.projectId for the catalog get-or-create.
export async function applyOperation(
  db: PrismaClient,
  list: List,
  operation: Operation,
): Promise<ListItem | null> {
  // Every operation targets an entry by id; a malformed id must be a clean 400 before any query
  // touches the uuid column (Prisma P2023 -> fake 500 otherwise).
  if (!isUuid(operation.itemId)) throw new ApiError(400, "Ungültige Eintrags-ID");

  switch (operation.op) {
    case "add_item": {
      // Semantic validation of the optional value fields (shape was checked by parseOperation).
      assertValidQuantity(operation.quantity);
      assertValidTextField(operation.unit, "Einheit");
      assertValidTextField(operation.category, "Kategorie");
      // Name validation (non-empty after normalization, length cap) lives inside
      // getOrCreateCatalogItem — the single source of truth for the article-name rule; it is
      // deliberately not duplicated here (DRY).

      // IDEMPOTENCY: if this entry id already exists, this is a replay (retry / offline queue).
      const existing = await db.listItem.findUnique({ where: { id: operation.itemId } });
      if (existing) {
        // Replay into the SAME list -> return the existing entry unchanged (no-op, applying twice
        // equals applying once). Same id in a DIFFERENT list -> a real id collision, which is a
        // client bug (UUIDs must be unique); 409 Conflict makes it visible instead of hiding it.
        if (existing.listId === list.id) return existing;
        throw new ApiError(409, "Eintrags-ID wird bereits verwendet");
      }

      // Article identity: resolve the typed name to the project's catalog row (create on first use).
      const catalogItem = await getOrCreateCatalogItem(db, {
        projectId: list.projectId,
        name: operation.name,
      });

      // Append at the end: next sortIndex = current max + 1. _max is null on an empty list -> 0.
      // (Not race-free under concurrent adds, but a duplicate sortIndex only makes ordering
      // ambiguous, never corrupts data — acceptable for the MVP, revisit with Slice 7 if needed.)
      const maxAgg = await db.listItem.aggregate({
        where: { listId: list.id },
        _max: { sortIndex: true },
      });
      const sortIndex = (maxAgg._max.sortIndex ?? 0) + 1;

      const created = await db.listItem.create({
        data: {
          id: operation.itemId, // the client-generated id IS the identity — never remap it
          listId: list.id,
          catalogItemId: catalogItem.id,
          quantity: operation.quantity ?? null,
          // ?? on purpose (not ||): only `undefined`/`null` inherit the catalog default; an
          // explicit empty string would be kept (though parse/UI never send one today).
          unit: operation.unit ?? catalogItem.defaultUnit,
          category: operation.category ?? catalogItem.defaultCategory,
          sortIndex,
        },
      });

      // Flow-back (Slice 4, MVP design §4.4): a category/unit the user supplied EXPLICITLY at add
      // time becomes the catalog default, so future lists inherit it. Inherited values arrive here
      // as undefined/null and are skipped by the helper — so this never writes a default back onto
      // itself. Runs only on first creation (replays returned early above), keeping add idempotent.
      await flowBackCatalogDefaults(db, catalogItem.id, {
        category: operation.category,
        unit: operation.unit,
      });
      return created;
    }

    case "update_item": {
      // The entry must exist IN THIS LIST: an id from another list must behave like "not found",
      // otherwise a member of project A could mutate entries in project B by guessing ids
      // (requireListAccess only authorized THIS list). findFirst with both conditions enforces it.
      const item = await db.listItem.findFirst({
        where: { id: operation.itemId, listId: list.id },
      });
      if (!item) throw new ApiError(404, "Eintrag nicht gefunden");

      // Per-field value validation: each field has its own type/range rules.
      switch (operation.field) {
        case "quantity":
          if (operation.value !== null && typeof operation.value !== "number") {
            throw new ApiError(400, "Menge muss eine Zahl sein");
          }
          assertValidQuantity(operation.value);
          break;
        case "sortIndex":
          // sortIndex is structural (not user-visible text): required, integer.
          if (typeof operation.value !== "number" || !Number.isInteger(operation.value)) {
            throw new ApiError(400, "Sortierung muss eine ganze Zahl sein");
          }
          break;
        case "unit":
        case "category":
          if (operation.value !== null && typeof operation.value !== "string") {
            throw new ApiError(400, "Ungültiger Wert");
          }
          assertValidTextField(operation.value, operation.field === "unit" ? "Einheit" : "Kategorie");
          break;
      }

      // Computed property name ([operation.field]) writes exactly ONE column — the field
      // granularity that Slice 7's per-field last-writer-wins depends on. @updatedAt bumps the
      // LWW timestamp automatically.
      const updated = await db.listItem.update({
        where: { id: item.id },
        data: { [operation.field]: operation.value },
      });

      // Flow-back (Slice 4): editing an entry's category/unit updates the article's catalog default
      // (MVP design §4.4). Only these two fields flow back — quantity/sortIndex are entry-specific,
      // not catalog memory. The helper ignores a null value, so clearing an entry's field never
      // erases the shared default. `item.catalogItemId` came from the findFirst load above.
      if (operation.field === "category" || operation.field === "unit") {
        await flowBackCatalogDefaults(db, item.catalogItemId, {
          [operation.field]: operation.value as string | null,
        });
      }
      return updated;
    }

    case "check_item": {
      // Same in-this-list scoping as update_item (see comment there).
      const item = await db.listItem.findFirst({
        where: { id: operation.itemId, listId: list.id },
      });
      if (!item) throw new ApiError(404, "Eintrag nicht gefunden");
      // Writes the target state (not a toggle) — idempotent under replay by construction.
      return db.listItem.update({ where: { id: item.id }, data: { checked: operation.checked } });
    }

    case "remove_item": {
      // deleteMany (not delete) because it tolerates 0 matches: removing an already-removed entry
      // is a SUCCESSFUL no-op (idempotency), and scoping by listId keeps foreign ids untouchable.
      await db.listItem.deleteMany({ where: { id: operation.itemId, listId: list.id } });
      return null;
    }
  }
}
