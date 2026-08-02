# Implementation Review — Slice 13: Design foundation

## 1. What was achieved

Slice 13 turns the UI design handoff into a reusable presentation layer: design tokens and Figtree in the global stylesheet, one icon set (`lucide-react` via `Icon`), and fourteen shared primitives (Button, TextField/FieldError, Card, RowLink, Avatar, Badge, SectionLabel, Chip, ChipTabs, EmptyState, Sheet, ConfirmSheet, InlineEdit, Banner) that every later UI slice must consume instead of inventing styling.

The slice goal is **fully met**. Nothing domain-related was touched: existing screens keep their unstyled markup (except `layout.tsx` for the font). The contract is proven by component tests plus a development-only gallery at `/dev/ui` (404 in production; middleware excludes `dev` so the gallery is reachable without login in development).

Automated verification: **37 test files / 274 tests** via `npx vitest run --exclude '**/node_modules/**' --exclude '**/dist/**'`. `npm run lint` reports only pre-existing errors in `docs/design/2026-08-01-ui-handoff/support.js` (gallery and `src/` are clean). `npm run build` succeeds. Manual browser checklist (Task 14): all **12** items PASS.

---

## 2. Steps taken

**Task 1 — Component test environment:** Added jsdom + Testing Library; `src/test/setup.ts` loads `.env.test` always and registers cleanup / jest-dom only when `document` exists so one setup file serves node DB tests and jsdom component tests.

**Task 2 — Design tokens + Figtree:** Replaced `globals.css` with the handoff palette / radii / shadows / motion / layout tokens; wired Figtree via `next/font/google` in `layout.tsx`; pinned colours in `design-tokens.test.ts`.

**Task 3 — Icon wrapper:** Thin `Icon` over `lucide-react` with locked stroke 1.75 so screens never import Lucide directly.

**Task 4 — Button:** Four action weights (primary / secondary / ghost / danger) as a CSS-Modules primitive.

**Task 5 — TextField + FieldError:** Label/`htmlFor` wiring, error alert, `useId`; human overruled the plan so `{...rest}` spreads **before** aria attrs and error wiring always wins (`391a658`).

**Task 6 — SectionLabel, Badge, Avatar:** Display atoms including deterministic `avatarColor` from a name string.

**Task 7 — Card + RowLink:** Surface container and whole-card `<a>` navigation row (slots must stay non-interactive).

**Task 8 — Chip + ChipTabs:** Pill chips with mutually exclusive `onClick` / `onRemove`; underline tab row for category filters.

**Task 9 — EmptyState:** Centred accent glyph + copy + action slot for every empty screen.

**Task 10 — Sheet:** Bottom sheet with Escape, overlay close, body scroll lock; no focus trap (MVP cut).

**Task 11 — ConfirmSheet:** Destructive confirmation stacked on Sheet (label + description + danger / neutral options).

**Task 12 — InlineEdit:** Tap-to-edit with Enter/blur save and Escape cancel via `skipBlur`.

**Task 13 — Banner:** Info and success tone banners for inline page messages.

**Task 14 — Dev gallery + manual verify:** `/dev/ui` gallery exercising every primitive; middleware `dev` exclusion; production 404 confirmed; 12-item browser checklist PASS.

**Task 15 — Docs:** This review, meta-plan status / progress log, CLAUDE.md UI layer section, plan file committed.

---

## 3. Core components built

| File / component | Role |
|---|---|
| `src/test/setup.ts` | Shared Vitest setup: dotenv for DB tests; conditional Testing Library cleanup + jest-dom for jsdom files. |
| `src/app/globals.css` | Single token source (`:root` colours, radii, shadows, motion, layout) plus light-only base styles and `sl-flash` keyframe (unused until Slice 16). |
| `src/test/design-tokens.test.ts` | Pins the handoff palette so colour drift is a deliberate test change. |
| `src/app/layout.tsx` | Loads Figtree and exposes it on `<html>` / `<body>`. |
| `src/components/ui/Icon.tsx` | Sole Lucide entry point; stroke locked at 1.75. |
| `src/components/ui/Button.tsx` | Four visual weights for primary actions and danger-as-text. |
| `src/components/ui/TextField.tsx` + `FieldError.tsx` | Labelled input with invalid border and announced error. |
| `src/components/ui/Card.tsx` | Elevated white surface for interactive containers. |
| `src/components/ui/RowLink.tsx` | Whole-card link with leading / meta / trailing slots. |
| `src/components/ui/Avatar.tsx` + `avatarColor.ts` | Initials glyph with deterministic accent colour. |
| `src/components/ui/Badge.tsx` | Small role/status label (e.g. OWNER). |
| `src/components/ui/SectionLabel.tsx` | Uppercase section heading. |
| `src/components/ui/Chip.tsx` | Pill chip; toggle **or** removable, never both. |
| `src/components/ui/ChipTabs.tsx` | Horizontal filter tabs with moving underline. |
| `src/components/ui/EmptyState.tsx` | Shared empty-screen pattern (glyph, title, body, action). |
| `src/components/ui/Sheet.tsx` | Bottom dialog with overlay, Escape, scroll lock. |
| `src/components/ui/ConfirmSheet.tsx` | Sheet specialised for consequential / destructive choices. |
| `src/components/ui/InlineEdit.tsx` | Inline rename control with keyboard save/cancel. |
| `src/components/ui/Banner.tsx` | Page-level info / success message strip. |
| `src/app/dev/ui/page.tsx` + `Gallery.tsx` | Dev-only primitive showcase (404 in production). |
| `src/middleware.ts` | Matcher excludes `dev` so the gallery is not Auth-gated. |
| `*.module.css` / `*.test.tsx` next to each primitive | Styles and role/text assertions (never CSS-module class names). |

---

## 4. Most important lines of code

### (a) One setup file, two environments (`src/test/setup.ts`)

```typescript
if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  await import("@testing-library/jest-dom/vitest");
  afterEach(() => cleanup());
}
```

Why it matters: `setupFiles` runs inside each file's Vitest environment. Node DB tests have no `document`; component tests opt in with `// @vitest-environment jsdom`. The guard keeps one setup file without breaking either world.

### (b) The design contract in code (`src/app/globals.css`)

```css
:root {
  --color-bg: #fcfcfb;
  --color-accent: #3e63c4;
  --color-danger: #bf4a41;
  /* ... */
  /* Desktop breakpoint is 900px. It is NOT a custom property because CSS
     custom properties cannot be used inside @media queries — every media query
     in this codebase writes the literal `900px` and refers back to this note. */
}
```

Why it matters: tokens are the handoff made executable. `design-tokens.test.ts` pins the palette; changing a colour means changing the test on purpose. The `900px` note prevents a false refactor into a custom property that `@media` cannot read.

### (c) Error wiring wins over `rest` (`src/components/ui/TextField.tsx`)

```typescript
<input
  {...rest}
  id={inputId}
  aria-invalid={error ? true : ariaInvalid}
  aria-describedby={error ? errorId : ariaDescribedBy}
/>
```

Why it matters: human overruled the plan's rest-after-aria order. Spreading `{...rest}` first ensures a caller cannot silence announcements by passing conflicting aria props. `useId` is why this component is a client component — forgetting an explicit `id` must not produce an unlabelled field.

### (d) `skipBlur` in InlineEdit (`src/components/ui/InlineEdit.tsx`)

```typescript
const skipBlur = useRef(false);
// Enter:
skipBlur.current = true;
commit();
// onBlur:
if (skipBlur.current) {
  skipBlur.current = false;
  return;
}
commit();
```

Why it matters: Enter (and Escape) close the editor, which immediately fires blur. Without the flag, blur would call `commit()` a second time — or turn Escape into "cancel, then save on blur".

### (e) Chip exclusivity (`src/components/ui/Chip.tsx`)

```typescript
if (onClick && !onRemove) {
  return (
    <button type="button" … onClick={onClick}>{children}</button>
  );
}
// else: <span> with optional remove <button>
```

Why it matters: a button inside a button is invalid HTML. The design never needs both behaviours on one chip, so the component encodes mutual exclusivity instead of papering over it.

### (f) Sheet scroll-lock ownership (`src/components/ui/Sheet.tsx`)

```typescript
useEffect(() => {
  if (!open) return;
  document.body.style.overflow = "hidden";
  return () => {
    document.body.style.overflow = "";
  };
}, [open, onClose]);
```

Why it matters: the early return when `!open` means cleanup only runs for an effect that actually took the lock. Clearing overflow on a closed sheet would unlock the body for a different open sheet that still owns it. Focus trap / focus restore are intentionally omitted for the MVP.

---

## 5. Architecture contribution

Slice 13 assembles the **presentation layer** the product was missing: a single token contract, one font, one icon path, and CSS-Modules primitives with a clear client/server split (only hook-bearing components carry `"use client"`: Sheet, ConfirmSheet, TextField, InlineEdit; the rest stay server-renderable).

It deliberately does **not** restyle existing screens, build layout chrome (header / drawer / sidebar), or invent list-row interactions — those belong to Slices 14, 11, and 12. The `sl-flash` keyframe lives in `globals.css` as part of the motion contract but has no consumer yet (Slice 16).

**Next:** Slice 14 consumes these primitives to restyle Login, Zugang verweigert, Home (including the new "Weitermachen" card), Projekte, and Verwaltung. While touching those pages it should also clear the locale-date hydration overlay inherited from earlier slices.
