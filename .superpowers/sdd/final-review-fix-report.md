# Slice 17 final review fix report

## Result

- Replaced the merge write's array transaction with a local interactive transaction.
- The transaction atomically increments the target, always writes `round3(incremented quantity)`
  while retaining the row lock, creates the `AbsorbedEntry` ledger row, and returns the rounded row.
- `MergeOutcome` now derives both quantities from that final persisted row.
- Strengthened the decimal regression test with a raw `quantity::text` read, proving PostgreSQL stores
  `0.3` rather than `0.30000000000000004`.
- Added coverage for replay after the target quantity was cleared to `null`.
- Updated the implementation plan snippet and documented Phase-2 remapping of absorbed client ids.

## Verification

### RED: regression test before the production fix

Command:

```text
npx vitest run src/lib/lists/operations.test.ts
```

Output:

```text
Test Files  1 failed (1)
Tests       1 failed | 48 passed (49)
Expected: "0.3"
Received: "0.30000000000000004"
```

### Targeted suite after fixes

Command:

```text
npx vitest run src/lib/lists/operations.test.ts
```

Output:

```text
Test Files  1 passed (1)
Tests       50 passed (50)
Duration    22.72s
```

### Full suite

Command:

```text
npm test
```

Output:

```text
Test Files  89 passed (89)
Tests       723 passed (723)
Duration    135.88s
```

### Static checks

```text
ReadLints: No linter errors found.
git diff --check: exit 0.
```

## Deferred findings

- Parallel identical replay (`P2002` re-read): deferred because safely recovering the exact original
  merge result across two concurrent transactions needs deliberate concurrency semantics beyond the
  required stored-rounding fix.
- Banner surviving a deleted row / flash state: deferred as Slice 16 territory, per review scope.
- Ledger pruning and a `list_id` index: not implemented, explicitly out of scope.
