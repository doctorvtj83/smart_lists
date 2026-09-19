import type { List, ListItem, PrismaClient } from "@prisma/client";
import { flowBackCatalogDefaults, getOrCreateCatalogItem } from "@/lib/catalog/catalog";
import { ApiError } from "@/lib/http/errors";
import { isUuid } from "@/lib/validate";
import { findMergeTarget, round3, type MergeOutcome } from "./merge";

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

/**
 * Per-field value rules for `update_item`, without touching the database.
 *
 * Why exported: the entry sheet's „Fertig" may send several fields in one Server
 * Action. Those become separate `update_item` ops (Slice 7 LWW granularity), but
 * the action must validate EVERY provided field BEFORE the first write — otherwise
 * quantity can commit and unit/category then fail, leaving a partial update and
 * skipping `revalidatePath`. Same switch as `applyOperation`'s update_item case;
 * keep them in lockstep.
 */
export function assertValidUpdateItemValue(
  field: UpdateItemOperation["field"],
  value: UpdateItemOperation["value"],
): void {
  switch (field) {
    case "quantity":
      if (value !== null && typeof value !== "number") {
        throw new ApiError(400, "Menge muss eine Zahl sein");
      }
      assertValidQuantity(value);
      break;
    case "sortIndex":
      // sortIndex is structural (not user-visible text): required, integer.
      if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new ApiError(400, "Sortierung muss eine ganze Zahl sein");
      }
      break;
    case "unit":
    case "category":
      if (value !== null && typeof value !== "string") {
        throw new ApiError(400, "Ungültiger Wert");
      }
      assertValidTextField(value, field === "unit" ? "Einheit" : "Kategorie");
      break;
  }
}

/**
 * What one operation did. `item` is the affected entry (null only after remove_item); `merge` is
 * non-null ONLY when an add was absorbed by an existing row.
 *
 * Why a result object instead of just the row: since Slice 17 an add can resolve to a row whose id
 * is NOT the one the client sent, and the UI has to say so („Zu 1 l Milch addiert → 3 l"). The
 * caller cannot reconstruct the target's previous quantity afterwards — subtracting the contribution
 * back out would be a second, drifting copy of the merge arithmetic.
 */
export interface OperationResult {
  item: ListItem | null;
  merge: MergeOutcome | null;
}

/**
 * Applies ONE operation to a list and reports both the resulting entry and whether it was a merge.
 *
 * The caller (route handler / server action) has already authorized access to `list` via
 * requireListAccess and passes the loaded row — so this core never re-checks permissions, and the
 * list is known to exist. Takes the full List (not just the id) because add_item needs
 * list.projectId for the catalog get-or-create.
 *
 * Most callers want `applyOperation` below; this form exists for the one caller that renders the
 * merge cue (addEntryFromRow).
 */
export async function applyOperationDetailed(
  db: PrismaClient,
  list: List,
  operation: Operation,
): Promise<OperationResult> {
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

      // STEP 2 — IDEMPOTENCY: if this entry id already exists, this is a replay (retry / offline
      // queue). Checked BEFORE the ledger (step 3, Task 4): a row under this id is the stronger
      // fact, and it is what a fall-through create leaves behind.
      const existing = await db.listItem.findUnique({ where: { id: operation.itemId } });
      if (existing) {
        // Replay into the SAME list -> return the existing entry unchanged (no-op, applying twice
        // equals applying once). Same id in a DIFFERENT list -> a real id collision, which is a
        // client bug (UUIDs must be unique); 409 Conflict makes it visible instead of hiding it.
        if (existing.listId === list.id) return { item: existing, merge: null };
        throw new ApiError(409, "Eintrags-ID wird bereits verwendet");
      }

      // STEP 3 — REPLAY OF A MERGE. No row carries this id, but the ledger may say it was absorbed
      // by one. Without this lookup a retried merged add would add its quantity a SECOND time, and
      // nothing on screen would reveal it (there is no duplicate row to notice).
      const absorbed = await db.absorbedEntry.findUnique({ where: { id: operation.itemId } });
      if (absorbed) {
        // Same id, different list: a reused UUID — the exact mirror of step 2's cross-list rule.
        // Falling through would try to insert a second ledger row under this primary key and turn a
        // client bug into a 500 (ruling R4).
        if (absorbed.listId !== list.id) {
          throw new ApiError(409, "Eintrags-ID wird bereits verwendet");
        }
        // `include`: the banner names the ARTICLE, whose name lives on the catalog row (article
        // identity, MVP design §3.1) — one query instead of a second round-trip.
        const target = await db.listItem.findFirst({
          where: { id: absorbed.targetItemId, listId: list.id },
          include: { catalogItem: true },
        });
        // The target must STILL EXIST. If it was deleted since (swipe-to-delete), the ledger is
        // ignored and this add falls through to a normal create — deliberately the same behaviour
        // add_item already has after a remove_item: the id is free again, so a replay re-creates
        // the entry. One rule, not two (recipes design §3).
        if (target) {
          // Reconstruct the outcome of the ORIGINAL application from the contribution the ledger
          // recorded, so a retry renders the identical banner instead of a silent nothing.
          //
          // Contribution 0 is the presence-merge discriminator (an add cannot legally contribute
          // 0 as a quantity — assertValidQuantity rejects it). Report the same null-quantity
          // outcome the first application produced, even if someone later typed a number onto
          // the row: the replay must still count as merged for applyRecipesToList's banner.
          if (absorbed.quantity === 0) {
            return {
              item: target,
              merge: {
                targetItemId: target.id,
                name: target.catalogItem.name,
                previousQuantity: null,
                quantity: null,
                unit: target.unit,
              },
            };
          }
          // A null quantity on a SUM merge means someone cleared the row afterwards — there is
          // no sum left to describe, so report the row without a merge cue rather than invent
          // numbers.
          const merge =
            target.quantity === null
              ? null
              : {
                  targetItemId: target.id,
                  name: target.catalogItem.name,
                  previousQuantity: round3(target.quantity - absorbed.quantity),
                  quantity: target.quantity,
                  unit: target.unit,
                };
          return { item: target, merge };
        }
      }

      // STEP 4 — Article identity: resolve the typed name to the project's catalog row (create on
      // first use).
      const catalogItem = await getOrCreateCatalogItem(db, {
        projectId: list.projectId,
        name: operation.name,
      });

      // STEP 5 — The unit this entry will ACTUALLY carry, resolved before anything is matched or
      // written. `undefined` = "not supplied" -> inherit the catalog default; `null` = explicit
      // empty. Computing it here rather than inline in the create is what makes two adds that both
      // inherit „Becher" land in the same merge bucket.
      const effectiveUnit =
        operation.unit !== undefined ? operation.unit : catalogItem.defaultUnit;
      // Normalize the "no quantity" case once: parseOperation admits both undefined and null.
      const quantity = operation.quantity ?? null;

      // STEP 6 — Find the row that should absorb this add. The query narrows to candidates only
      // (this list, this article); findMergeTarget owns every RULE, including re-checking the
      // article — one source of truth, so the `where` clause and the predicate cannot drift apart
      // (recipes design §3 / ruling R3). Always queried, including when quantity is null: D1 now
      // absorbs an unquantified add into an existing unquantified row (presence merge). Skipping
      // the query here would re-create the UAT Check 5 duplicate „Salz".
      const target = findMergeTarget(
        await db.listItem.findMany({
          where: { listId: list.id, catalogItemId: catalogItem.id },
          orderBy: { sortIndex: "asc" },
        }),
        { catalogItemId: catalogItem.id, quantity, unit: effectiveUnit },
      );

      // STEP 7 — MERGE: a quantified add changes only the number; a presence merge changes
      // nothing on the row (the wish is already there). Category, unit spelling, sortIndex and
      // checked state belong to the row that was already there; overwriting them would silently
      // re-file an entry the user deliberately placed.
      // KNOWN MVP LIMIT: two parallel adds can both observe no target and create two rows. That
      // race stays deliberately open because it is self-revealing (the user sees both rows), unlike
      // silent quantity loss. Closing it needs a partial unique index plus retry, which is out of
      // MVP scope.
      if (target) {
        // Presence merge: neither side has a number. Record the ledger so a retry resolves here,
        // but do NOT invent a quantity — the row stays a bare wish. Contribution 0 is the replay
        // discriminator (see step 3); a real add cannot contribute 0 (assertValidQuantity).
        if (quantity === null) {
          await db.absorbedEntry.create({
            data: {
              id: operation.itemId,
              listId: list.id,
              targetItemId: target.id,
              quantity: 0,
            },
          });
          await flowBackCatalogDefaults(db, catalogItem.id, {
            category: operation.category,
            unit: operation.unit,
          });
          const existing = await db.listItem.findUniqueOrThrow({ where: { id: target.id } });
          return {
            item: existing,
            merge: {
              targetItemId: existing.id,
              name: catalogItem.name,
              previousQuantity: null,
              quantity: null,
              unit: existing.unit,
            },
          };
        }

        // ONE interactive transaction, because incrementing, normalizing and recording the ledger
        // are one fact: "this add became part of that row". The callback is intentionally local:
        // no helper that requires a full PrismaClient receives Prisma's narrower transaction
        // client. Keeping all three writes here also keeps the row lock acquired by the increment
        // until the rounded value and replay marker are safely committed together.
        const contribution = quantity;
        const mergedItem = await db.$transaction(async (tx) => {
          const incrementedItem = await tx.listItem.update({
            where: { id: target.id },
            // An atomic increment, NOT an absolute value computed from the row we read a moment
            // ago: a read-modify-write loses one of the two amounts when two adds merge into the
            // same row concurrently — silently, because there is no duplicate row to reveal it.
            // Postgres performs the addition under the row lock, so both contributions survive.
            data: { quantity: { increment: contribution } },
          });
          const roundedQuantity = round3(incrementedItem.quantity!);
          // PostgreSQL double precision preserves binary-float tails such as
          // 0.30000000000000004, while Prisma deserializes that returned value to 0.3 and therefore
          // makes a JavaScript equality check unable to detect the tail. Always write round3's
          // result while this transaction still owns the row lock so the persisted number and the
          // number shown by formatGermanNumber never diverge.
          const finalItem = await tx.listItem.update({
            where: { id: target.id },
            data: { quantity: roundedQuantity },
          });

          await tx.absorbedEntry.create({
            data: {
              id: operation.itemId, // the client's id IS the ledger key
              listId: list.id,
              targetItemId: target.id,
              quantity: contribution,
            },
          });

          return finalItem;
        });

        // Derived from what was actually written, never from the stale read — the same derivation
        // the replay path (funnel step 3, Task 4) uses. "Total minus my own contribution" stays a
        // true statement even when someone else's add landed in between.
        const summed = mergedItem.quantity!;
        const previousQuantity = round3(summed - contribution);

        // Flow-back still fires: an explicitly supplied category/unit is CATALOG memory and is
        // independent of where the entry landed (design §3, step 7).
        await flowBackCatalogDefaults(db, catalogItem.id, {
          category: operation.category,
          unit: operation.unit,
        });

        return {
          item: mergedItem,
          merge: {
            targetItemId: mergedItem.id,
            name: catalogItem.name,
            previousQuantity,
            quantity: summed,
            unit: mergedItem.unit,
          },
        };
      }

      // No target: create the row exactly as before this slice.
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
          quantity,
          // `undefined` = "not supplied" → inherit the catalog default. `null` = explicit empty
          // (e.g. adding under the „Ohne Kategorie" chip) → store null on the entry. Using `??`
          // here would wrongly collapse both and make an explicit clear impossible.
          unit: effectiveUnit,
          category:
            operation.category !== undefined ? operation.category : catalogItem.defaultCategory,
          sortIndex,
        },
      });

      // Flow-back (Slice 4, MVP design §4.4): a category/unit the user supplied EXPLICITLY at add
      // time becomes the catalog default, so future lists inherit it. Inherited values arrive as
      // undefined; explicit clears arrive as null — both are skipped by the helper (`!= null`),
      // so this never writes a default back onto itself or erases shared catalog memory. Runs only
      // on first creation (replays returned early above), keeping add idempotent.
      await flowBackCatalogDefaults(db, catalogItem.id, {
        category: operation.category,
        unit: operation.unit,
      });
      return { item: created, merge: null };
    }

    case "update_item": {
      // The entry must exist IN THIS LIST: an id from another list must behave like "not found",
      // otherwise a member of project A could mutate entries in project B by guessing ids
      // (requireListAccess only authorized THIS list). findFirst with both conditions enforces it.
      const item = await db.listItem.findFirst({
        where: { id: operation.itemId, listId: list.id },
      });
      if (!item) throw new ApiError(404, "Eintrag nicht gefunden");

      // Per-field value validation: shared with multi-field server actions (validate-then-apply).
      assertValidUpdateItemValue(operation.field, operation.value);

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
      return { item: updated, merge: null };
    }

    case "check_item": {
      // Same in-this-list scoping as update_item (see comment there).
      const item = await db.listItem.findFirst({
        where: { id: operation.itemId, listId: list.id },
      });
      if (!item) throw new ApiError(404, "Eintrag nicht gefunden");
      // Writes the target state (not a toggle) — idempotent under replay by construction.
      const checkedItem = await db.listItem.update({
        where: { id: item.id },
        data: { checked: operation.checked },
      });
      return { item: checkedItem, merge: null };
    }

    case "remove_item": {
      // deleteMany (not delete) because it tolerates 0 matches: removing an already-removed entry
      // is a SUCCESSFUL no-op (idempotency), and scoping by listId keeps foreign ids untouchable.
      await db.listItem.deleteMany({ where: { id: operation.itemId, listId: list.id } });
      return { item: null, merge: null };
    }
  }
}

/**
 * The operations funnel as every existing caller knows it: apply one operation, get the affected
 * entry back (null after remove_item).
 *
 * Kept as a thin wrapper rather than changing every call site, because only ONE caller
 * (addEntryFromRow) needs to know that an add was merged. The rest — the REST endpoint, the list
 * screen's check/remove/update actions, the pre-fill loop — care about the row and nothing else.
 *
 * NOTE THE CONTRACT CHANGE THIS INHERITS: since Slice 17 the returned row's id may differ from
 * `operation.itemId`. Callers must use the RETURNED row and never assume the id they sent now
 * exists as a row.
 */
export async function applyOperation(
  db: PrismaClient,
  list: List,
  operation: Operation,
): Promise<ListItem | null> {
  const { item } = await applyOperationDetailed(db, list, operation);
  return item;
}
