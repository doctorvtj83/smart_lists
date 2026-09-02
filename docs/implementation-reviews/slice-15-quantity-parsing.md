# Slice 15 — Quantity Parsing in the Entry Row

## 1. What was achieved

Slice 15 adds the input grammar promised by the UI handoff to the trailing list row. Inputs such as
`1,5 l Milch`, `500g Mehl`, and `3 Joghurt` now become ordinary list entries whose quantity, unit, and
article name are separated, while conservative refusal rules leave ambiguous input unchanged.

The product behavior is implemented and fully covered by automated tests. The complete suite passes
with **74 test files / 594 tests**. The signed-in manual checklist could not be executed in this
environment because the local app reached the Google OAuth login gate without an authenticated
allowlisted session; this limitation is recorded rather than counted as a pass.

## 2. Steps taken

1. **Pure parser.** Added `parseEntryInput.ts` and table-driven tests for German decimals, glued units,
   aliases, project-specific units, whitespace normalization, conservative refusals, and prototype-key
   safety.
2. **Server integration.** Reworked `addEntryFromRow` to load project unit vocabulary, protect existing
   number-leading catalog names, parse raw input, and feed the result into the existing `add_item`
   operation. Integration tests cover catalog identity, default inheritance, unit flow-back, categories,
   and the escape hatch.
3. **Trailing-row wiring.** `ListBody` now strips a recognized quantity prefix for autocomplete and
   re-attaches it as text when a parsed-name suggestion is selected. A review fix added
   `usedParsedSearch`, preventing `7 Zwe` → `7 Zwerge Bier` from becoming `7 7 Zwerge Bier`.
4. **Full verification and documentation.** Ran the complete test suite, ESLint, TypeScript, and the
   feasible unauthenticated browser smoke check; then recorded the architectural decisions and roadmap
   status here and in the meta project plan.

Verification results:

- `npm test` — exit 0; **74 files / 594 tests passed**.
- `npm run lint` — exit 0; **0 errors / 14 warnings**. All warnings are unused typed mock parameters in
  `ListBody.test.tsx`; they do not fail the configured lint gate.
- `npx tsc --noEmit` — exit 2 due to five inherited test-mock errors in `RevokeSheet.test.tsx`,
  `CatalogBrowser.test.tsx`, and `InviteForm.test.tsx`. No Slice 15 production file is reported.
- `npm run dev` — server started successfully. The browser reached `/login`, but the six signed-in
  quantity/catalog/pre-fill checks were blocked by Google OAuth and were not claimed as passed.

## 3. Core components built

- **`BASE_UNIT_ALIASES` (`parseEntryInput.ts`)** — the curated lowercase-alias-to-canonical-unit
  vocabulary for common German household units.
- **`buildUnitLookup` (`parseEntryInput.ts`)** — unions the base vocabulary with distinct
  project-catalog defaults. Base aliases win collisions so canonical display forms stay stable.
- **`parseEntryInput` (`parseEntryInput.ts`)** — a pure, database-free parser that extracts a positive
  leading quantity, optionally consumes one recognized unit token, and otherwise returns the cleaned
  input unchanged.
- **`addEntryFromRow` (`addEntry.ts`)** — the server-owned orchestration point. It checks the raw catalog
  identity, loads the complete project unit vocabulary, parses only when safe, resolves category
  prompting against the effective article, and submits one ordinary `add_item`.
- **`ListBody` prefix handling (`ListBody.tsx`)** — uses the same pure parser only to improve the
  autocomplete query. `usedParsedSearch` records whether the visible options came from the stripped
  article name, and only that path may carry the formatted prefix into a selected suggestion.

`src/lib/lists/operations.ts` was deliberately **not touched**. Every parser result is represented by
the existing `add_item` fields (`name`, `quantity`, `unit`, and `category`), so the operation completely
describes its effect. Replaying that serialized operation in a Phase 2 offline queue therefore behaves
the same as the online write and requires no parser-specific operation flag.

## 4. Most important lines of code

### Reject malformed decimal continuations

```ts
const LEADING_NUMBER = /^(\d+(?:[.,]\d+)?)(\s*)(?=[^\s\d.,])(.*)$/;
```

The lookahead requires the next character after the captured number to be neither a digit nor another
decimal separator. The separately captured whitespace gap also lets the parser distinguish a glued
known unit such as `500g` from an unknown suffix such as `6er` or `1,5%`; the latter inputs are refused
in full rather than silently losing part of their article name.

### Refuse a unit with no surviving article name

```ts
const name = others.join(" ");
if (!name) return unparsed;
```

After a known unit consumes the whole remainder, as in `3 l`, there is no article left. Returning the
original input prevents the catalog from learning an article incorrectly named `l`.

### Let an exact catalog identity beat the heuristic

```ts
const parsed = rawArticle
  ? { quantity: null, unit: null, name: input.name }
  : parseEntryInput(input.name, buildUnitLookup(catalogUnits.map((row) => row.defaultUnit)));
```

An existing raw catalog hit is authoritative. This escape hatch preserves article names such as
`7 Zwerge Bier` instead of silently splitting the catalog into a quantity and a different article.

### Avoid a duplicate effective-name lookup

```ts
const knownArticle =
  rawArticle ??
  (parsedNormalized === rawNormalized || !parsedNormalized
    ? null
    : await db.catalogItem.findUnique({ /* effective-name key */ }));
```

When parsing did not change the normalized name, the first raw lookup already answered whether the
article exists. The equality short-circuit keeps the common add path from paying for a second database
query.

### Keep parsing authority on the server

```ts
const item = await applyOperation(db, list, {
  op: "add_item",
  itemId: input.itemId,
  name: parsed.name,
  quantity: parsed.quantity ?? undefined,
  unit: parsed.unit ?? undefined,
  category,
});
```

The server parser translates text into the established operation contract. `undefined` preserves the
existing “not supplied, inherit catalog default” semantics, while an explicit parsed unit follows the
normal catalog flow-back rule.

### Remember which autocomplete query produced the options

```ts
const usedParsedSearch =
  parsedDraft.quantity !== null && rawSuggestions.options.length === 0;
const suggestions = usedParsedSearch
  ? buildAutocomplete(articles, parsedDraft.name)
  : rawSuggestions;
```

Raw-name matches remain authoritative on the client too. Only when raw search has no options does the
row search the stripped article name; this distinction protects numeric article suggestions.

### Re-attach text only on the parsed-search path

```ts
const prefix = formatQuantityLabel(parsedDraft.quantity, parsedDraft.unit);
const submitted =
  usedParsedSearch && prefix && name !== draft.trim() ? `${prefix} ${name}` : name;
```

The client sends a single textual name field rather than parsed quantity/unit fields. This preserves the
existing action boundary and lets `addEntryFromRow` remain the storage source of truth. The
`usedParsedSearch` guard also ensures a raw numeric article tap is not prefixed twice.

## 5. Architecture contribution

The trailing entry row now implements the handoff's complete MVP input grammar without weakening the
catalog's identity rule: quantity is entry-specific, and only the parsed article name can create a
catalog item. Recognized units are ordinary explicit `add_item` fields, so existing flow-back teaches
the catalog defaults that future pre-filled lists already consume.

The parser is pure and shared for presentation, but storage interpretation remains in
`addEntryFromRow` immediately before the established operations funnel. No parallel mutation path and
no parser-only wire state were introduced, which keeps polling, idempotency, and a future offline replay
aligned.

**Deliberate cut:** glued text is accepted only when its first token is a known unit. Consequently,
`2x Milch` is deliberately refused and retained as the whole article name; multiplier syntax remains
outside Slice 15 rather than weakening the parser's conservative invariant.

**Next:** Slice 8 (PWA polish) is the next open slice. Slice 16 (per-row remote-change flash) remains an
optional follow-up after real-world use.
