# Debt Paydown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the concretely-fixable technical debt accumulated across Slices 1–12 before starting Slice 15, so the next feature slice builds on a green, race-free foundation.

**Architecture:** Four independent fixes, each self-contained and independently testable/rejectable: (1) a pure `parseSince` helper so an empty `?since=` query is a baseline pull, not cursor `0`; (2) an in-flight guard in `ListSyncPoller` so slow polls never stack; (3) a Serializable transaction around the catalog delete guard so a concurrent add cannot slip past the count-then-delete window; (4) an ESLint ignore list so `npm run lint` reflects only `src/`. No shared state between tasks — they can be executed in any order.

**Tech Stack:** Next.js App Router (TypeScript), Prisma against Neon Postgres, Vitest + Testing Library, ESLint flat config (`eslint.config.mjs`).

## Global Constraints

- **Language:** Code, comments, and this doc in **English**; in-app user-facing strings stay **German** (unchanged here — no user copy is added).
- **Comment density:** This is a learning project — every function gets a what/why comment; every non-obvious line gets an inline comment. Do **not** thin out existing comments when editing (CLAUDE.md "Code documentation standard").
- **Testing:** Core logic is tested as **pure functions**, never through route handlers (the codebase has zero route-handler tests by design). Component tests put `// @vitest-environment jsdom` at the top and use Testing Library, asserting roles/behavior, never CSS-Module class names.
- **DB seam:** Every core takes an **injected `PrismaClient`** (`db` first parameter). Tests run against the Neon `test` branch and need `.env.test`.
- **Baseline before starting:** `npx vitest run` → **72 files / 554 tests** passing (Slice 12 state). Each task below adds tests to that total; the final suite must stay green.
- **Commits:** Frequent, one per task. End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Debt inventory — what this plan fixes, and what it deliberately does not

**In scope (the four tasks below):**

| # | Debt item | Source in the progress log |
|---|-----------|----------------------------|
| 1 | Empty `?since=` becomes cursor `0` instead of a baseline pull | Slices 5, 7, 10–14 "inherited open items" |
| 2 | Overlapping polls — `setInterval` can stack a second request while the first is in flight | Slice 7 "minor non-blocking review notes" |
| 3 | Catalog delete count→delete TOCTOU without a transaction | Slice 10 "deferred minors" |
| 4 | `npm run lint` exits non-zero on non-`src/` files (`support.js`, `.remember/`) | Slices 10–14 lint notes (2 errors + 9 warnings, all outside `src/`) |

**Deliberately deferred — do NOT attempt in this plan (each needs its own session or a human):**

- **PageHeader / nav hydration overlay.** Still flagged on project/list/katalog pages. The locale-date cause was already closed in Slice 14 (`src/lib/format/date.ts`); the residual overlay is undiagnosed and cites a `<Link>` in a `leading` slot. It needs a **superpowers:systematic-debugging** session to find the actual mismatched attribute before any fix — writing a fix here would be a guess. Out of scope.
- **Toggle tap target < 44 px.** A CSS-only change to `Toggle.module.css` with no jsdom-observable behavior (pixel geometry is not assertable in Testing Library). It belongs with Slice 8 PWA/touch polish, where a device pass verifies it. Out of scope.
- **Autocomplete arrow-key navigation.** This is a *deliberate design cut*, not debt: the component's own JSDoc explains the design offers no active-row highlight and says "Revisit if the design ever grows a highlighted row." Adding it now is scope creep beyond the handoff. Out of scope.
- **`middleware` → `proxy` migration (Next 16 deprecation).** Touches the Auth.js v5 request path; correctness depends on Auth.js's support for the new `proxy.ts` convention, which must be verified against the installed version first. Too risky to bundle with unrelated fixes. Its own maintenance slice. Out of scope.
- **Member-path browser smoke** (the "second Google account" checks skipped in Slices 11/14). Requires the owner to sign in as a second allowlisted identity — not agentically executable. Left as a manual checklist item for the owner. Out of scope.

---

### Task 1: `parseSince` — empty `?since=` is a baseline pull, not cursor 0

Today the delta route parses `?since=` with `Number(param)`, and `Number("")` is `0` (finite), so a client that sends `?since=` with no value gets `since = 0` — a "changed since epoch" query that re-serializes every entry body. Move the parse into a pure, tested helper next to `computeCursor` (the codebase tests logic as pure functions, not through routes) and treat empty/whitespace/non-numeric as `undefined` (the real baseline-pull signal `getListDelta` already understands).

**Files:**
- Modify: `src/lib/lists/delta.ts` (add `parseSince` beside `computeCursor`)
- Test: `src/lib/lists/delta.test.ts` (add a `parseSince` describe block)
- Modify: `src/app/api/lists/[listId]/delta/route.ts:38-40` (use `parseSince`)

**Interfaces:**
- Produces: `parseSince(param: string | null): number | undefined` — `null`/`""`/whitespace/non-finite/negative → `undefined`; a finite non-negative numeric string → that number.
- Consumes: nothing new. `getListDelta(db, listId, since?)` already treats `since === undefined` as "send every body" (`delta.ts:84-87`).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/lists/delta.test.ts` (import `parseSince` alongside the existing `computeCursor` import at the top of the file):

```ts
describe("parseSince", () => {
  it("returns undefined for a missing param (baseline pull)", () => {
    expect(parseSince(null)).toBeUndefined();
  });

  it("returns undefined for an empty or whitespace param instead of cursor 0", () => {
    // The whole point of this helper: `?since=` with no value must NOT become 0,
    // which would ask getListDelta to re-send every body on every poll.
    expect(parseSince("")).toBeUndefined();
    expect(parseSince("   ")).toBeUndefined();
  });

  it("parses a finite non-negative numeric cursor", () => {
    expect(parseSince("1699999999999")).toBe(1699999999999);
    expect(parseSince("0")).toBe(0); // an explicit 0 IS a valid cursor; only empty/absent is baseline
  });

  it("returns undefined for a non-numeric or negative param", () => {
    expect(parseSince("abc")).toBeUndefined();
    expect(parseSince("NaN")).toBeUndefined();
    expect(parseSince("-5")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/lists/delta.test.ts`
Expected: FAIL — `parseSince is not a function` / not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/lists/delta.ts`, directly below `computeCursor`:

```ts
// Parses the ?since cursor off the delta request's query string. The distinction that matters:
// an ABSENT or EMPTY `since` is a baseline pull (return undefined -> getListDelta sends every body
// once), while a present numeric string is a real cursor. The old inline `Number(param)` parse
// turned `?since=` (empty) into 0 because Number("") === 0 is finite — a subtle "changed since the
// epoch" query that re-serialized the whole list on every poll. Pure and synchronous so it is unit
// tested here rather than through the route handler (this codebase tests logic, not HTTP adapters).
export function parseSince(param: string | null): number | undefined {
  if (param === null) return undefined; // param not present at all
  const trimmed = param.trim();
  if (trimmed === "") return undefined; // `?since=` with no value -> baseline, not cursor 0
  const n = Number(trimmed);
  // A cursor is epoch-ms: finite and never negative. Anything else is treated as "no cursor".
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/lists/delta.test.ts`
Expected: PASS (all existing `computeCursor`/`getListDelta` tests plus the 4 new `parseSince` cases).

- [ ] **Step 5: Wire the route handler to the helper**

In `src/app/api/lists/[listId]/delta/route.ts`, change the import on line 17 to include `parseSince`:

```ts
import { getListDelta, parseSince } from "@/lib/lists/delta";
```

Replace the parse block (lines 35–40, the `sinceParam` / `sinceNum` / `since` trio and its comment) with:

```ts
    // Optional ?since cursor. Empty, absent, or non-numeric values are a baseline pull (undefined),
    // NOT cursor 0 — see parseSince. Keeping this parse in a tested pure helper is why the route
    // stays a thin adapter with no logic of its own to test.
    const since = parseSince(new URL(request.url).searchParams.get("since"));
```

- [ ] **Step 6: Verify build + full suite**

Run: `npm run build`
Expected: succeeds (route still compiles).
Run: `npx vitest run src/lib/lists/delta.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/lists/delta.ts src/lib/lists/delta.test.ts src/app/api/lists/[listId]/delta/route.ts
git commit -m "fix(sync): empty ?since= is a baseline pull, not cursor 0

Extract parseSince pure helper; treat empty/whitespace/non-numeric as
undefined so the delta endpoint stops re-serializing every body when a
client sends ?since= with no value.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: In-flight guard in `ListSyncPoller` — no overlapping polls

`ListSyncPoller` fires `poll()` on a fixed `setInterval(POLL_INTERVAL_MS)`. If one request takes longer than 2 s (slow network on a phone), the next interval tick starts a second overlapping request. Add a ref-based in-flight guard so a new poll is skipped while the previous one's request is still outstanding. The existing `cancelled` unmount guard and the cancelled-before-JSON checks stay exactly as they are — this only prevents *stacking*.

**Files:**
- Modify: `src/app/lists/[listId]/ListSyncPoller.tsx`
- Test: `src/app/lists/[listId]/ListSyncPoller.test.tsx` (new file)

**Interfaces:**
- Consumes: `ListSyncPoller` default export and `POLL_INTERVAL_MS` named export (both already exist).
- Produces: no new exports. Internal behavior change only.

- [ ] **Step 1: Write the failing test**

Create `src/app/lists/[listId]/ListSyncPoller.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/lists/[listId]/ListSyncPoller.test.tsx`
Expected: FAIL — `expected 2 to be 1` (both ticks fetch, no guard yet).

- [ ] **Step 3: Add the in-flight ref and guard**

In `src/app/lists/[listId]/ListSyncPoller.tsx`:

Add a ref beside the existing baseline refs (after `const metaRef = useRef(initialList);`, ~line 51):

```ts
  // Guards against a slow poll being lapped by the next interval tick: while one request is
  // outstanding we skip new polls rather than stacking a second overlapping request. A ref (not
  // state) because flipping it must not re-render — this component renders null.
  const inFlightRef = useRef(false);
```

Inside `poll()`, add the guard right after the `document.hidden` check (after line 61) and wrap the body in try/finally so the flag is always released. The new top of `poll()`:

```ts
    async function poll() {
      // Don't poll a tab the user isn't looking at — saves battery/requests on iPhone. The next
      // visible tick picks up whatever changed in the meantime.
      if (typeof document !== "undefined" && document.hidden) return;

      // A previous poll's request is still outstanding (slow network) — skip this tick instead of
      // stacking a second request. The finally block below clears the flag the moment it settles.
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        // ... existing fetch / res.ok / json / changed / ref-advance / router.refresh block, UNCHANGED ...
      } catch {
        // Network blip — swallow and let the interval retry on the next tick.
      } finally {
        // Release the guard whether the poll succeeded, errored, or bailed early (unmount / !res.ok /
        // hidden-mid-flight). Every early `return` inside the try still runs this.
        inFlightRef.current = false;
      }
    }
```

Note: the existing `try { ... } catch { ... }` becomes `try { ... } catch { ... } finally { ... }`. Do not remove or alter the existing `cancelled` checks, the `cache: "no-store"` fetch, or the `changed`/`router.refresh()` logic — only add the guard and the `finally`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/lists/[listId]/ListSyncPoller.test.tsx`
Expected: PASS — `fetch` called exactly once across two ticks.

- [ ] **Step 5: Verify the full suite + build**

Run: `npx vitest run`
Expected: PASS (554 + new tests; nothing regressed).
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/lists/[listId]/ListSyncPoller.tsx src/app/lists/[listId]/ListSyncPoller.test.tsx
git commit -m "fix(sync): skip poll while a previous request is in flight

Add an inFlightRef guard + finally release so a slow delta request on a
phone can't be lapped by the next 2s interval tick, preventing stacked
overlapping polls. Unmount/cancelled guards unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Serializable transaction around the catalog delete guard (close the TOCTOU)

`deleteCatalogArticle` reads `countListsUsingArticle` and then, in a *separate* statement, calls `catalogItem.delete`. Between those two, a concurrent `add_item` can put the article on a list. Because `ListItem.catalogItemId` cascades on delete, the delete then silently strips that just-added entry — including from completed lists the N-of-M suggestion statistic reads. Wrap the guard-read and the delete in one `Serializable` transaction so the concurrent insert forces a serialization failure and the delete rolls back. Precedent: `createProject` in `src/lib/projects/projects.ts:34` already uses `db.$transaction(async (tx) => …)`.

**Files:**
- Modify: `src/lib/catalog/manage.ts:273-293` (`deleteCatalogArticle`)
- Test: `src/lib/catalog/manage.test.ts` (existing `deleteCatalogArticle` describe block at line 317 is the safety net; add one explicit regression)

**Interfaces:**
- Signature unchanged: `deleteCatalogArticle(db: PrismaClient, input: DeleteCatalogArticleInput): Promise<void>`.
- `countListsUsingArticle(db, projectId, catalogItemId)` stays exported and unchanged — the edit panel's read model still uses it. The transaction inlines its `findMany` against the `tx` client (a `Prisma.TransactionClient` is not assignable to the `PrismaClient` that `countListsUsingArticle` requires, per the Slice 5 typing note), so the guard read and the delete share one snapshot.

- [ ] **Step 1: Confirm the existing delete tests are green (the safety net)**

Run: `npx vitest run src/lib/catalog/manage.test.ts -t deleteCatalogArticle`
Expected: PASS — 6 existing cases (unused delete succeeds; used-by-active 409; used-by-completed 409; favourite cascade; foreign-project 404; non-uuid 404).

- [ ] **Step 2: Write one new regression test pinning behavior after the refactor**

Add inside the existing `describe("deleteCatalogArticle", …)` block in `src/lib/catalog/manage.test.ts` (place it after the last existing `it`). This pins that the guard message is byte-identical whether the guard runs inside or outside the transaction — the refactor must not change the German 409 wording:

```ts
  it("keeps the exact used-in-lists 409 wording after the transactional guard", async () => {
    // One list references the article, so delete must be refused with the shared German sentence
    // (formatUsedInLists), proving the guard still runs inside the new transaction.
    const article = await createCatalogArticle(db, { projectId, name: "Zwiebeln" });
    const list = await createList(db, { projectId, name: "Wochenende", createdBy: userId });
    await applyOperation(db, {
      listId: list.id,
      op: { type: "add_item", id: crypto.randomUUID(), name: "Zwiebeln" },
    });

    await expect(
      deleteCatalogArticle(db, { projectId, catalogItemId: article.id }),
    ).rejects.toMatchObject({ status: 409, message: "Löschen nicht möglich — wird in 1 Liste verwendet." });
  });
```

Before writing, confirm the exact helpers/imports already used by this test file (`createList`, `applyOperation`, `crypto.randomUUID`, `userId`, `projectId`). Read the top of `src/lib/catalog/manage.test.ts` and its existing "used-by-active 409" test (around line 334) and mirror its setup verbatim — reuse the same import names and the same list-seeding call it already uses rather than introducing new ones. If that test seeds the list differently, copy that exact form. Also confirm the expected sentence against `formatUsedInLists(1)` in `src/lib/format/plural.ts`; use whatever that function actually returns for `1`.

- [ ] **Step 3: Run the new test to verify it passes against the CURRENT (pre-refactor) code**

Run: `npx vitest run src/lib/catalog/manage.test.ts -t "exact used-in-lists 409 wording"`
Expected: PASS already (the current two-statement guard produces this exact 409). This is a characterization test — it locks the observable contract *before* the refactor so Step 5 can prove the refactor preserved it. (If it fails, the wording in the test is wrong — fix the test to match `formatUsedInLists`, not the code.)

- [ ] **Step 4: Refactor `deleteCatalogArticle` to a Serializable transaction**

Replace the body of `deleteCatalogArticle` (`src/lib/catalog/manage.ts`, lines ~273–293) with:

```ts
export async function deleteCatalogArticle(
  db: PrismaClient,
  input: DeleteCatalogArticleInput,
): Promise<void> {
  const { projectId, catalogItemId } = input;
  // Shape check first: a malformed id can never match a uuid column, and Prisma would throw P2023
  // (a fake 500) instead of returning null. 404 = "not yours". Done outside the transaction — it
  // needs no DB round-trip.
  if (!isUuid(catalogItemId)) throw new ApiError(404, "Artikel nicht gefunden");

  // Guard-read AND delete in ONE Serializable transaction. Without this, a concurrent add_item that
  // puts the article on a list between the count and the delete slips past the guard, and the
  // ListItem.catalogItemId cascade then strips that just-added entry — including from completed lists
  // the N-of-M suggestion statistic reads (MVP design §4.3). Serializable makes the concurrent insert
  // and this delete conflict, so one aborts (Prisma P2034) and the delete rolls back rather than
  // quietly rewriting history. Precedent: createProject in projects.ts.
  await db.$transaction(
    async (tx) => {
      // Project-scoped existence check inside the transaction snapshot — a foreign id is a 404.
      const article = await tx.catalogItem.findFirst({ where: { id: catalogItemId, projectId } });
      if (!article) throw new ApiError(404, "Artikel nicht gefunden");

      // Distinct lists (active AND completed) using the article, read against the SAME snapshot as
      // the delete. Inlined rather than calling countListsUsingArticle because that core takes a
      // PrismaClient and `tx` is a TransactionClient (Slice 5 typing note) — the query is identical.
      const rows = await tx.listItem.findMany({
        where: { catalogItemId, list: { projectId } },
        select: { listId: true },
        distinct: ["listId"],
      });
      if (rows.length > 0) {
        // Same sentence the panel prints from the read model — see formatUsedInLists.
        throw new ApiError(409, `Löschen nicht möglich — ${formatUsedInLists(rows.length)}.`);
      }

      // The article's Favorite row (0 or 1) goes with it via the FK cascade — intended: an article
      // that no longer exists cannot stay a favourite.
      await tx.catalogItem.delete({ where: { id: catalogItemId } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
```

`Prisma` is already imported at the top of the file (`import { Prisma } from "@prisma/client";`), so `Prisma.TransactionIsolationLevel.Serializable` needs no new import. `countListsUsingArticle` stays as-is above — do not delete it.

- [ ] **Step 5: Run the whole delete block + the new regression**

Run: `npx vitest run src/lib/catalog/manage.test.ts -t deleteCatalogArticle`
Expected: PASS — all 6 original cases plus the new wording regression. (The concurrency property itself is not unit-testable deterministically in Vitest; the transaction is the fix, and the existing suite proves the non-concurrent behavior is unchanged.)

- [ ] **Step 6: Verify the full suite + build**

Run: `npx vitest run`
Expected: PASS.
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/catalog/manage.ts src/lib/catalog/manage.test.ts
git commit -m "fix(catalog): close delete TOCTOU with a Serializable transaction

Guard-read and delete now share one Serializable snapshot so a concurrent
add_item can't slip an article onto a list between the count and the
delete, where the cascade would strip the just-added entry (incl. from
completed lists the suggestion statistic reads).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: ESLint ignores — `npm run lint` reflects only `src/`

`npm run lint` currently exits non-zero on **2 errors + 9 warnings**, every one of them in files that are **not** application source: `docs/design/2026-08-01-ui-handoff/support.js` (the design prototype's vendored runtime — `ReactDOM.render` deprecation, `no-assign-module-variable`, etc.) and `.remember/tmp/last-ndc.ts` (a scratch file). Every slice review has had to write the sentence "2 errors + 8/9 warnings, all pre-existing in support.js — `src/` clean." Add those paths to the existing `globalIgnores` so a red lint run means a real `src/` problem again.

**Files:**
- Modify: `eslint.config.mjs:9-15` (`globalIgnores` array)

**Interfaces:** none (build tooling only).

- [ ] **Step 1: Confirm the current failure and its location**

Run: `npm run lint`
Expected: `✖ 11 problems (2 errors, 9 warnings)` — read the paths and confirm **all** are under `docs/design/2026-08-01-ui-handoff/` or `.remember/`. (If any problem is under `src/`, STOP — that is a real lint error to fix, not to ignore; fix it and re-run before continuing.)

- [ ] **Step 2: Add the non-source paths to `globalIgnores`**

In `eslint.config.mjs`, extend the `globalIgnores([...])` array with the two non-source trees. The result:

```js
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-source trees: linting these adds noise and false failures. `support.js` is the design
    // handoff's VENDORED prototype runtime (React 17-era ReactDOM.render, CommonJS `module` assigns)
    // — a reference artifact we never edit, not app code. `.remember/` is scratch/session state.
    // Ignoring them makes a red `npm run lint` mean a real problem in `src/` again.
    "docs/design/**",
    ".remember/**",
  ]),
```

- [ ] **Step 3: Verify lint is now green**

Run: `npm run lint`
Expected: exits 0 with no problems reported.

- [ ] **Step 4: Sanity-check that `src/` is still actually linted**

Run: `npx eslint src --max-warnings=0 && echo "SRC CLEAN"`
Expected: prints `SRC CLEAN` (confirms the ignore didn't accidentally suppress `src/` — the tree is still checked and clean). If ESLint reports "no files matched" instead, the config's file globs changed unexpectedly — investigate before committing.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore(lint): ignore docs/ prototype + .remember scratch

The design handoff's vendored support.js and .remember scratch files were
the only source of lint errors; ignore both so a red \`npm run lint\` again
means a real problem in src/.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all four tasks)

- [ ] `npx vitest run` → all pass (554 baseline + Task 1's 4 + Task 2's 1 + Task 3's 1 = **560 tests**, 74 files).
- [ ] `npm run lint` → exits 0, no problems.
- [ ] `npm run build` → succeeds.
- [ ] Update the meta plan's Progress Log (`docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`) with a "Debt paydown" entry: the four items closed, and the five explicitly deferred (hydration overlay, Toggle 44px, Autocomplete arrow-keys, middleware→proxy, member-path smoke) so the next agent knows they remain open and *why* they weren't bundled here.

## Self-review notes (author)

- **Coverage:** All four in-scope debt items map to a task. The five out-of-scope items are listed with a reason each, per the skill's guidance not to fake fixes.
- **Placeholder scan:** No "add error handling"/"similar to Task N"/TBD. Every code step carries real code. Task 3 Step 2 is the one place asking the implementer to *mirror existing setup* rather than inventing helpers — it names the exact functions and the fallback (match `formatUsedInLists`), which is intentional precision, not a placeholder.
- **Type consistency:** `parseSince(param: string | null): number | undefined` is used identically in the route (Task 1). `deleteCatalogArticle`'s signature is unchanged (Task 3); `countListsUsingArticle` is explicitly kept. `POLL_INTERVAL_MS` / default export match the real `ListSyncPoller` exports (Task 2).
- **Independence:** No task depends on another's output; execute in any order or in parallel worktrees.
