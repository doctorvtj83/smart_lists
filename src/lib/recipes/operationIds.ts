import { createHash } from "node:crypto";

/**
 * Deterministic operation ids for applying a recipe (spec §6, ruling R1).
 *
 * THE PROBLEM THIS SOLVES: applying a recipe is n separate `add_item` operations with no
 * transaction around them, and since Slice 17 a merged add does not create a row — it adds a
 * number to an existing one. A naive retry after a half-applied recipe would therefore add the
 * landed quantities a SECOND time, and nothing on screen would reveal it (there is no duplicate
 * row to notice). The operations model already has the cure: an `add_item` whose id has been seen
 * before replays as a no-op, via the row itself or via the `AbsorbedEntry` ledger. All that is
 * missing is a way to produce the SAME ids on the retry.
 *
 * THE PATTERN: name-based (v5) UUIDs. Instead of remembering a list of random ids somewhere
 * between two HTTP requests, the id is COMPUTED from three values the retry already carries: the
 * client's apply token, the recipe and the article. Same inputs, same ids, no state to store —
 * which also means a recipe line edited between two attempts cannot shift the mapping the way an
 * echoed id array would.
 */

/**
 * A fixed namespace, as RFC 4122 §4.3 requires. It is an arbitrary constant, generated once and
 * never changed: changing it would make every future retry of an in-flight apply derive fresh ids
 * and double-count. It is not a secret — nothing here is a security boundary.
 */
const APPLY_NAMESPACE = "9f2b1a54-6c7d-4a3e-9c21-5f0b3d8e7a10";

/** The 16 raw bytes of a canonical UUID string. */
function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

/**
 * Derives the `add_item` id for ONE planned entry.
 *
 * The three inputs are joined length-prefixed rather than with a plain separator: a recipe id
 * containing a colon would otherwise be able to collide with a different (recipe, article) pair,
 * and while our ids are UUIDs today, an id format that only works because of what callers happen
 * to pass is a trap for the next reader.
 */
export function deriveOperationId(
  token: string,
  recipeId: string,
  catalogItemId: string,
): string {
  const name = [token, recipeId, catalogItemId].map((part) => `${part.length}:${part}`).join("");

  // SHA-1 is what RFC 4122 v5 prescribes. It is used here as a deterministic spreading function,
  // never as a security primitive, so its collision weakness against a deliberate attacker is not
  // in play — and an attacker who could choose these inputs could simply send the ids directly.
  const hash = createHash("sha1").update(uuidToBytes(APPLY_NAMESPACE)).update(name, "utf8").digest();

  // Take the first 16 bytes and stamp the version/variant bits the format requires. Buffer.from
  // copies, so the digest is not mutated under anyone else's feet.
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5 (name-based, SHA-1)
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
