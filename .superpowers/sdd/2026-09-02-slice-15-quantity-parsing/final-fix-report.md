# Slice 15 Final Whole-Branch Fix Report

## What changed

- Tightened `LEADING_NUMBER` so the parser retains the whitespace gap between a
  leading quantity and its remainder.
- Refused glued suffixes unless their first token is a known unit. This keeps
  `500g Mehl` parseable while preserving `1,5% Milch`, `6er Pack Bier`, and
  `2x Milch` as whole article names.
- Added regression coverage for those glued forms and replaced the tautological
  catalog-unit fixture with `Palette`, including an assertion that blank unit
  aliases are not added.
- Corrected the `Promise.all` comment to describe one round-trip of latency
  across two concurrent database queries.
- Updated the Slice 15 implementation review and meta progress log with the
  tightened conservative rule and the deliberate `2x Milch` refusal.

## Tests run

- RED: `npx vitest run src/lib/lists/parseEntryInput.test.ts` — exit 1 as
  expected; 3 new regression tests failed because the old parser returned
  `% Milch`, `er Pack Bier`, and `x Milch`.
- GREEN: `npx vitest run src/lib/lists/parseEntryInput.test.ts` — exit 0;
  1 file and 21 tests passed.
- Final required verification:
  `npx vitest run src/lib/lists/parseEntryInput.test.ts src/lib/lists/addEntry.test.ts`
  — exit 0; 2 files and 40 tests passed.
- IDE diagnostics for the three touched TypeScript files — no linter errors.

## Commits

- One final-fix commit contains the parser, tests, comments, documentation, and
  this report. Its hash is recorded in the completion response because a commit
  cannot embed its own content-derived hash.
