# Slice 8 — PWA Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Smart Lists installable on an iPhone home screen, survive a lost connection with a real offline page instead of a browser error, meet the design's ≥44px tap-target mandate on every control, and close the three inherited debts the meta plan parked here.

**Architecture:** Four independent strands. (1) **Installability** — a Next App Router `manifest.ts`, iOS metadata, and PNG icons generated from the login tile's mark and guarded by a header-parsing test. (2) **Service worker** — a hand-written `public/sw.js` whose entire routing decision is one pure function, tested by loading the real file into a stub worker scope; it cache-firsts the immutable `/_next/static/*` chunks and falls back to a prerendered `/offline` page when a navigation fails. Nothing is queued and no API response is cached — true offline stays Phase 2. (3) **Touch polish** — one reusable `::after` hit-area expander pattern applied to every sub-44px control, enforced by a CSS-parsing test in the same spirit as `design-tokens.test.ts`. (4) **Catalog autocomplete transport** — the list and Favoriten screens stop shipping the whole catalog as a prop and fetch `?q=` per keystroke instead; `buildAutocomplete` keeps running unchanged over the fetched page, so every Slice-15 semantic survives.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, CSS Modules, Vitest (node + jsdom), Prisma/Neon. No new dependencies.

**Spec:** No dedicated spec document exists for this slice. Its requirements are the union of:
- [docs/design/2026-08-01-ui-handoff/README.md](../../design/2026-08-01-ui-handoff/README.md) § **PWA / Mobil** — the binding paragraph: *"iPhone-first: Safe Areas (`env(safe-area-inset-*)`) oben/unten respektieren, Bottom-Sheets mit extra Bottom-Padding (~30px), Tap-Targets ≥44px, `touch-action:pan-y` auf swipebaren Zeilen."*
- [docs/superpowers/specs/2026-06-02-smart-lists-vision-prd.md](../specs/2026-06-02-smart-lists-vision-prd.md) § Plattform — *"Installierbare PWA, UX optimiert für iPhone (Touch, Home-Screen, sichere Bereiche, schnelle Interaktion)"*; offline capability is explicitly long-term, not MVP.
- [docs/superpowers/specs/2026-06-02-smart-lists-mvp-design.md](../specs/2026-06-02-smart-lists-mvp-design.md) §9 build order — *"PWA-Feinschliff"* as the closing slice.
- [docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md](2026-06-04-smart-lists-projektplan-meta.md) — the debt items tagged as belonging here.

**Scope decisions taken with the owner before writing this plan (2026-09-05):**

| Question | Decision |
|---|---|
| Service worker depth | **Shell cache + offline page.** Precache the offline page and icons, cache-first the hashed `/_next/static/*` chunks, network-only for everything else. **No** mutation queue, **no** API-response caching. |
| App icons | **Generated in-repo from the mark the app already has** — the login screen's accent tile with the white Lucide `check` — by a committed script driving ImageMagick. Task 1 pins each file's dimensions *and* its colour type with a test. |
| Inherited debt to absorb | **All four:** Toggle <44px, the full touch-target audit, the PageHeader hydration overlay, and the `<datalist>` → fetch-on-keystroke replacement. |

> **Revision (2026-09-05, after the scope questions):** the icon decision was originally
> "the owner supplies the PNGs", which made Task 1 a blocking gate. It was revised once ImageMagick
> turned out to be installed already: the mark is fully determined by geometry that is *already in the
> repo* (`src/app/login/page.module.css` — 64px tile, 18px radius, 30px glyph), so there was no design
> decision left to outsource, only a rasterisation job. Task 1 is no longer a gate. Revisit only if the
> product ever wants a mark other than the check tile — that would be real design work, and it would
> also mean restyling the login tile to match.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **In-app user-facing strings are German.** Code identifiers, comments, and this plan are English (CLAUDE.md § Language convention).
- **Every function gets a comment explaining what it does and why it exists. Every non-obvious block gets an inline comment explaining the reasoning.** Name any pattern used and say why it was chosen. **Never remove or thin out an existing comment when editing a file** — amend it (CLAUDE.md § Code documentation standard).
- **Styling is CSS Modules only.** Icons come from `lucide-react` and are always rendered through `Icon` (stroke 1.75). Font is Figtree via `next/font/google`.
- **Component tests put `// @vitest-environment jsdom` on line 1** and use Testing Library. Assert roles and text, **never CSS-Module class names** (CLAUDE.md § UI layer).
- **No new npm dependencies in this slice.** The stack is locked by the meta plan. Task 1's icon generator shells out to **ImageMagick**, which is a system tool already present on the dev box — it is needed only to *regenerate* the icons, never to build, test or run the app, and the generated PNGs are committed.
- **Design tokens are the only source of colour/radius/shadow/motion values.** Never write a literal hex in a CSS Module.
- **Tap targets are ≥44px** (handoff § PWA / Mobil). This slice makes that enforceable.
- **`.env.test` must hold the Neon `test`-branch `DATABASE_URL`, never `.env`'s.** Every DB test truncates all core tables in `beforeEach`.
- **Test commands:** whole suite `npm test`; one file `npx vitest run <path>`; lint `npm run lint`; build `npm run build`.
- **Commit after every task.** Commit messages may be German or English, consistent within the change.
- **Baseline before this slice: 74 test files / 594 tests passing.** Every task must leave the suite green.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `scripts/generate-app-icons.mjs` | Renders the four icons from the login tile's geometry via ImageMagick. The one place the icon proportions are written down. |
| `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png` | Manifest icons (generated, committed). |
| `public/apple-touch-icon.png` | iOS home-screen icon (generated, committed, opaque). |
| `src/test/pwa-icons.test.ts` | Parses the PNG headers and pins each icon's size, bit depth and colour type. |
| `src/lib/pwa/app-metadata.ts` | `appMetadata` / `appViewport` / `THEME_COLOR` — the root layout's metadata, moved out so it can be unit-tested. |
| `src/lib/pwa/app-metadata.test.ts` | Pins the install-relevant metadata fields. |
| `src/app/manifest.ts` | The web app manifest route (`/manifest.webmanifest`). |
| `src/app/manifest.test.ts` | Pins manifest fields and their agreement with `THEME_COLOR`. |
| `src/app/offline/page.tsx`, `page.module.css` | The German offline fallback screen the service worker serves. |
| `src/app/offline/RetryButton.tsx` | Client island: reloads the page. |
| `src/app/offline/page.test.tsx` | Component test for the offline screen. |
| `public/sw.js` | The service worker: precache, cache-first static, offline navigation fallback. |
| `src/test/sw.test.ts` | Loads the real `public/sw.js` into a stub worker scope and drives its handlers. |
| `src/lib/pwa/register.ts` | `shouldRegisterServiceWorker` — the pure "may we register?" predicate. |
| `src/lib/pwa/register.test.ts` | Tests that predicate. |
| `src/components/pwa/ServiceWorkerRegistrar.tsx` | Client island mounted in the root layout that performs the registration. |
| `src/components/pwa/ServiceWorkerRegistrar.test.tsx` | jsdom test for the registration effect. |
| `src/test/touch-targets.test.ts` | The audit: parses CSS Modules and asserts every listed control has a ≥44px hit area. |
| `src/lib/catalog/vocabulary.ts` | `getCatalogVocabulary` — the lean per-project category/unit read that replaces shipping the whole catalog. |
| `src/lib/catalog/vocabulary.test.ts` | DB test for it. |
| `src/components/ui/useCatalogSearch.ts` | Debounced, abortable client hook over `GET /api/projects/:id/catalog?q=`. |
| `src/components/ui/useCatalogSearch.test.tsx` | jsdom test for the hook. |
| `docs/implementation-reviews/slice-8-pwa-polish.md` | The slice's Definition-of-Done review document. |

**Modified**

| Path | Change |
|---|---|
| `src/app/layout.tsx` | Re-export metadata from the new module; mount `ServiceWorkerRegistrar`. |
| `src/middleware.ts` | Exempt `/offline` from the auth matcher. |
| `src/middleware.test.ts` | Cover `/offline`, `/sw.js`, `/manifest.webmanifest`. |
| `eslint.config.mjs` | Service-worker globals for `public/sw.js`. |
| `src/components/ui/Toggle.module.css` | Hit-area expander. |
| `src/components/ui/Chip.module.css` | Hit-area expanders for `.interactive` and `.remove`. |
| `src/components/ui/ChipTabs.module.css` | Hit-area expander for `.tab`. |
| `src/components/ui/Button.module.css` | Hit-area expanders for `.text` and `.danger`; amend the existing comment. |
| `src/app/lists/[listId]/EntryRow.module.css` | Hit-area expander for `.check`. |
| `src/app/lists/[listId]/page.module.css` | Hit-area expander for `.bannerAction`. |
| `src/app/admin/page.module.css` | Hit-area expander for `.rowAction`. |
| `src/app/page.module.css` | Hit-area expander for `.adminLink`. |
| `src/app/projects/[projectId]/favoriten/FavoritesEditor.module.css` | `row-gap` so expanders on wrapped chip rows cannot overlap. |
| `src/app/lists/[listId]/EntrySheet.module.css`, `src/app/projects/[projectId]/NewListSheet.module.css` | Same. |
| `src/lib/catalog/search.ts` | Substring matching, JS-side German ordering and cut; delete `CATALOG_DATALIST_LIMIT`. |
| `src/lib/catalog/search.test.ts` | Cover the new matching and ordering. |
| `src/lib/catalog/sort.ts` | Amend the note that pointed at this slice. |
| `src/lib/catalog/autocomplete.ts` | Amend the doc comment: the array is now a fetched page, not the whole catalog. |
| `src/app/lists/[listId]/page.tsx`, `ListBody.tsx`, `ListBody.test.tsx` | Drop the `articles` prop; take `units` + `categories`; use the hook. |
| `src/app/projects/[projectId]/favoriten/page.tsx`, `FavoritesEditor.tsx`, `FavoritesEditor.test.tsx` | Same. |
| `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md` | Status table + progress log. |

---

## Architecture notes the tasks depend on

**Why the middleware matters for every PWA file.** `src/middleware.ts` protects everything except paths matching `api/auth|login|auth/error|dev(?:/|$)|_next/static|_next/image|.*\..*`. The trailing `.*\..*` means **anything with a dot in the path is already public** — `/sw.js`, `/manifest.webmanifest`, `/icons/icon-192.png` and `/apple-touch-icon.png` all pass. `/offline` has no dot, so it would redirect to `/login`, and the service worker would precache a login redirect instead of the offline page. Task 5 adds the exemption.

**Why the autocomplete can move to the server with one fetch, not two.** Slice 15 made the trailing row search twice: first with the raw draft, then — only if the raw search found nothing and the parser peeled off a quantity — with the parsed article name. Because the parsed name is always a *substring* of the raw draft, a substring search for the parsed name returns a **superset** of a substring search for the raw draft. So one request keyed on the parsed name (or the raw draft when there is no quantity) fetches every candidate both local searches need, and the existing pure `buildAutocomplete` runs over that page twice exactly as it does today. No Slice-15 logic is duplicated or moved to the server.

This is why Task 11 changes `searchCatalog` from prefix to substring matching: keeping the server on `startsWith` would silently regress the dropdown, where typing "milch" currently finds "Buttermilch".

**The one hit-area expander pattern.** Every sub-44px control gets the same rule instead of hand-computed insets:

```css
.control {
  position: relative;
}

.control::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
}
```

It centres a box that is at least 44×44 on the control without moving a single drawn pixel, and it works regardless of the control's own size — which matters because chips come in two heights (27px `.chip`, 32px `.outline`). Its one trap: on **wrapped** rows of controls the expanders of two rows overlap unless the row pitch is ≥44px, which is why Task 10 also raises `row-gap` in the three chip containers.

---

## Task 1: The app icons and a header guard

**Files:**
- Create: `scripts/generate-app-icons.mjs`
- Create (generated by that script): `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `public/apple-touch-icon.png`
- Test: `src/test/pwa-icons.test.ts`

**Interfaces:**
- Consumes: the mark's geometry, which already exists in `src/app/login/page.module.css:14-24` and `src/app/login/page.tsx:15-17`.
- Produces: the four file paths above, exactly as spelled. Task 2 (`app-metadata.ts`) and Task 3 (`manifest.ts`) reference these strings verbatim.

**The mark, and where its numbers come from.** The app already has one: the login screen's logo tile. Every proportion below is that tile, converted to a ratio so it scales to any canvas.

| Property | Login tile | As a ratio | Source |
|---|---|---|---|
| Fill | `--color-accent` | `#3e63c4` | `globals.css:23` |
| Glyph colour | `--color-on-accent` | `#ffffff` | `globals.css:27` |
| Corner radius | 18px of 64px | **28.125%** of the side | `login/page.module.css:16-17` |
| Glyph size | 30px of 64px | **46.875%** of the side | `login/page.tsx:17` |
| Glyph | Lucide `check`, `M20 6 9 17l-5-5` in a 24×24 viewBox | — | `login/page.tsx:1` |
| Stroke width | 1.75 | **1.75/24** of the glyph box | `Icon.tsx` (every icon in the app) |

The tile's `--shadow-logo` is deliberately **not** reproduced: iOS and Android draw their own elevation under an app icon, and a baked-in shadow reads as dirt.

**What differs per file, and why:**

| File | Size | Shape | Glyph | Colour type |
|---|---|---|---|---|
| `public/icons/icon-192.png` | 192×192 | Rounded tile, **transparent** corners | 46.875% | 6 (RGBA) |
| `public/icons/icon-512.png` | 512×512 | Rounded tile, **transparent** corners | 46.875% | 6 (RGBA) |
| `public/icons/maskable-512.png` | 512×512 | **Square, full-bleed, opaque** | **40%** | 2 (RGB) |
| `public/apple-touch-icon.png` | 180×180 | **Square, full-bleed, opaque** | 46.875% | 2 (RGB) |

The two full-bleed files are not the rounded artwork re-exported. `maskable-512.png` is cropped by Android to whatever shape the launcher uses, so it must have no corners of its own and no transparency — ship the rounded tile as maskable and Android draws a white box behind the transparent corners. Its glyph is smaller because the crop makes the icon appear zoomed. `apple-touch-icon.png` is opaque because iOS ignores alpha and composites it onto black, and square because iOS applies its own corner mask.

- [ ] **Step 1: Write the failing test**

Create `src/test/pwa-icons.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Pins the PWA icon set: the files must exist, be exactly the sizes the manifest
 * claims, AND carry the right alpha channel. A manifest that promises 512×512
 * and ships a 400×400 file is rejected silently by the install prompt on some
 * browsers, so "the file is there" is not enough.
 *
 * The colour-type assertion is the one that catches the expensive mistake. A
 * transparent apple-touch-icon looks fine everywhere except an actual iPhone
 * home screen, where iOS composites the transparency onto black — and a
 * transparent maskable icon makes Android draw a white box behind the corners.
 * Neither shows up in any other test, in the build, or in a desktop browser.
 *
 * Why a hand-rolled PNG parser instead of an image library: a PNG's IHDR chunk
 * puts every field at a fixed byte offset, so a dozen lines of Buffer reads
 * replace a dependency. The meta plan locks the stack; this is not worth a devDep.
 */

// The 8 magic bytes every PNG starts with. Reading them first turns "someone
// committed a JPEG named .png" into a clear failure instead of a garbage size.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// PNG colour types, from the spec. Only the two this project produces are named.
const COLOUR_TYPE_RGB = 2; // opaque, no alpha channel at all
const COLOUR_TYPE_RGBA = 6; // truecolour with alpha

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colourType: number;
}

/** Reads a PNG's IHDR chunk — the header every PNG must open with. */
function readPngHeader(relativePath: string): PngHeader {
  const buffer = readFileSync(resolve(process.cwd(), relativePath));
  // Bytes 0–7 signature, 8–11 chunk length, 12–15 chunk type ("IHDR"), then
  // width and height as big-endian uint32s at 16 and 20, bit depth at 24 and
  // colour type at 25.
  expect(buffer.subarray(0, 8).equals(PNG_SIGNATURE), `${relativePath} is not a PNG`).toBe(true);
  expect(buffer.subarray(12, 16).toString("ascii"), `${relativePath} has no IHDR`).toBe("IHDR");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colourType: buffer[25],
  };
}

// The exact contract. src/app/manifest.ts and src/lib/pwa/app-metadata.ts
// reference these same paths; changing one without the other fails a test.
const EXPECTED_ICONS: Array<{ path: string; size: number; colourType: number }> = [
  // The two "any" icons draw their own rounded corners, so the area outside the
  // radius has to be transparent — hence RGBA.
  { path: "public/icons/icon-192.png", size: 192, colourType: COLOUR_TYPE_RGBA },
  { path: "public/icons/icon-512.png", size: 512, colourType: COLOUR_TYPE_RGBA },
  // Android crops this one itself; transparency would become a white box.
  { path: "public/icons/maskable-512.png", size: 512, colourType: COLOUR_TYPE_RGB },
  // iOS composites transparency onto black and applies its own corner mask.
  { path: "public/apple-touch-icon.png", size: 180, colourType: COLOUR_TYPE_RGB },
];

describe("PWA icons", () => {
  it.each(EXPECTED_ICONS)("$path is a square $size×$size 8-bit PNG", ({ path, size }) => {
    const header = readPngHeader(path);
    expect(header.width).toBe(size);
    expect(header.height).toBe(size);
    // 16-bit would double the file size for no visible gain at icon scale, and
    // a palette PNG (colour type 3) would make the alpha assertion below
    // meaningless, since palette transparency lives in a separate tRNS chunk.
    expect(header.bitDepth).toBe(8);
  });

  it.each(EXPECTED_ICONS)("$path has the alpha channel its platform needs", ({ path, colourType }) => {
    expect(readPngHeader(path).colourType).toBe(colourType);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/pwa-icons.test.ts`
Expected: FAIL — eight cases, each `ENOENT: no such file or directory`.

- [ ] **Step 3: Write the generator script**

Create `scripts/generate-app-icons.mjs`:

```js
/**
 * Renders the four PWA icons from the mark the app already has.
 *
 * WHY a script and not four committed binaries with no provenance: the mark is
 * the login screen's logo tile (src/app/login/page.module.css), and every number
 * below is that tile expressed as a ratio. Written down here, the icons stay
 * traceable to the design — if --color-accent ever changes, regenerating is one
 * command instead of a round-trip to whoever still has the source file.
 *
 * The PNGs it produces ARE committed: the build never runs this, and CI has no
 * ImageMagick. This is a maintenance tool, run by hand:
 *
 *   node scripts/generate-app-icons.mjs
 *
 * Requires ImageMagick 7 (`magick`) on PATH. It is a system tool, not an npm
 * dependency — the meta plan's locked stack is untouched.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

// --- The mark, as ratios ---------------------------------------------------
// Sourced from src/app/login/page.module.css (64px tile, 18px radius) and
// src/app/login/page.tsx (30px Lucide `check`). Expressed as fractions of the
// canvas so one set of numbers serves every icon size.
const ACCENT = "#3e63c4"; // --color-accent
const ON_ACCENT = "#ffffff"; // --color-on-accent
const RADIUS_RATIO = 18 / 64; // 28.125% of the side
const GLYPH_RATIO = 30 / 64; // 46.875% of the side
const VIEWBOX = 24; // Lucide's coordinate space
const STROKE_UNITS = 1.75; // Icon.tsx uses this stroke for every glyph
// Lucide "check": path "M20 6 9 17l-5-5" — three points, two segments.
const CHECK_POINTS = [
  [20, 6],
  [9, 17],
  [4, 12],
];

/**
 * Renders one icon.
 *
 * `rounded` picks between the two shapes the platforms need: a tile with
 * transparent corners (the manifest's `purpose: "any"` icons, which are shown
 * as-is) and an opaque full-bleed square (maskable + apple-touch, both of which
 * are cropped by the OS and must not supply corners or alpha of their own).
 */
function render({ out, size, glyphRatio, rounded }) {
  const box = size * glyphRatio; // the 24-unit viewBox, scaled to this canvas
  const offset = (size - box) / 2; // centred on both axes
  const scale = box / VIEWBOX;
  const polyline = CHECK_POINTS.map(
    ([x, y]) => `${(offset + x * scale).toFixed(2)},${(offset + y * scale).toFixed(2)}`,
  ).join(" ");

  // colour type 6 = RGBA, 2 = RGB with no alpha channel. Pinned explicitly
  // because ImageMagick otherwise picks a palette PNG (type 3) for an image
  // this flat, and palette transparency lives in a tRNS chunk the icon guard
  // cannot see.
  const [background, tile, colourType] = rounded
    ? [
        "none",
        `roundrectangle 0,0 ${size - 1},${size - 1} ${(size * RADIUS_RATIO).toFixed(2)},${(size * RADIUS_RATIO).toFixed(2)}`,
        "6",
      ]
    : [ACCENT, `rectangle 0,0 ${size - 1},${size - 1}`, "2"];

  execFileSync("magick", [
    "-size", `${size}x${size}`, `xc:${background}`,
    "-fill", ACCENT, "-stroke", "none", "-draw", tile,
    // Stroke only, no fill: the check is a polyline, not a filled shape. Round
    // caps and joins are what make it read as the Lucide glyph rather than a
    // chevron with cut ends.
    "-fill", "none", "-stroke", ON_ACCENT,
    "-strokewidth", (STROKE_UNITS * scale).toFixed(3),
    "-draw", `stroke-linecap round stroke-linejoin round polyline ${polyline}`,
    "-colorspace", "sRGB", "-depth", "8",
    "-define", `png:color-type=${colourType}`, "-define", "png:bit-depth=8",
    out,
  ]);

  console.log(`wrote ${out}`);
}

mkdirSync("public/icons", { recursive: true });

render({ out: "public/icons/icon-192.png", size: 192, glyphRatio: GLYPH_RATIO, rounded: true });
render({ out: "public/icons/icon-512.png", size: 512, glyphRatio: GLYPH_RATIO, rounded: true });
// 40% rather than 46.875%: Android crops this file to the launcher's shape,
// which makes the artwork appear zoomed, and the glyph has to stay inside the
// maskable safe zone (the centred circle covering the middle 80%).
render({ out: "public/icons/maskable-512.png", size: 512, glyphRatio: 0.4, rounded: false });
render({ out: "public/apple-touch-icon.png", size: 180, glyphRatio: GLYPH_RATIO, rounded: false });
```

- [ ] **Step 4: Generate the icons**

Run: `node scripts/generate-app-icons.mjs`
Expected: four `wrote …` lines. If `magick: command not found`, install ImageMagick 7 or hand the four files over by another route — the test in Step 1 is the contract either way.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/test/pwa-icons.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6: Look at the icons**

Open all four. Confirm: the two `icon-*.png` are blue rounded tiles with transparent corners; `maskable-512.png` and `apple-touch-icon.png` are square, edge-to-edge blue with no rounding. The last two look wrong in isolation — that is correct, the OS supplies the corners.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-app-icons.mjs public/icons public/apple-touch-icon.png src/test/pwa-icons.test.ts
git commit -m "feat(pwa): generate the app icon set from the login tile mark"
```

---

## Task 2: App metadata module (iOS install + theme colour)

**Files:**
- Create: `src/lib/pwa/app-metadata.ts`
- Test: `src/lib/pwa/app-metadata.test.ts`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `public/apple-touch-icon.png` (Task 1).
- Produces:
  - `export const THEME_COLOR: string` — `"#fcfcfb"`. Task 3's manifest imports it.
  - `export const appMetadata: Metadata`
  - `export const appViewport: Viewport`

**Why a separate module rather than editing `layout.tsx` in place:** `layout.tsx` imports `./globals.css` and `next/font/google`, neither of which a Vitest node-environment test can load. Moving the two exported objects into a plain module makes the install-relevant fields — which are this slice's actual deliverable — testable, and the layout keeps them by re-export so nothing about the framework contract changes.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pwa/app-metadata.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { appMetadata, appViewport, THEME_COLOR } from "./app-metadata";

describe("app metadata", () => {
  it("points at the manifest route Next generates from src/app/manifest.ts", () => {
    expect(appMetadata.manifest).toBe("/manifest.webmanifest");
  });

  it("declares the iOS home-screen fields that make an install look like an app", () => {
    // `capable` is what drops Safari's browser chrome once the icon is tapped.
    expect(appMetadata.appleWebApp).toMatchObject({
      capable: true,
      title: "Smart Lists",
      statusBarStyle: "default",
    });
  });

  it("declares the apple-touch-icon the icon guard pins", () => {
    expect(JSON.stringify(appMetadata.icons)).toContain("/apple-touch-icon.png");
  });

  it("keeps viewport-fit cover so the safe-area tokens report real values", () => {
    expect(appViewport.viewportFit).toBe("cover");
    expect(appViewport.themeColor).toBe(THEME_COLOR);
  });

  it("never blocks pinch zoom", () => {
    // Locking the scale is an accessibility failure, and iOS ignores it anyway.
    expect(appViewport.maximumScale).toBeUndefined();
    expect(appViewport.userScalable).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/pwa/app-metadata.test.ts`
Expected: FAIL — `Failed to resolve import "./app-metadata"`.

- [ ] **Step 3: Write the module**

Create `src/lib/pwa/app-metadata.ts`:

```ts
import type { Metadata, Viewport } from "next";

/**
 * The root layout's metadata and viewport, extracted so they can be unit-tested.
 *
 * Why they do not live in layout.tsx any more: that file imports globals.css and
 * next/font/google, so a node-environment test cannot import it. These objects
 * ARE the installability contract of this slice, so they need a test. layout.tsx
 * re-exports them, which is all Next.js requires.
 */

/**
 * The browser/OS chrome colour. One constant because THREE places must agree:
 * the viewport export below, the web app manifest's `theme_color`, and the
 * --color-bg design token. A drift shows up as a coloured seam above the header
 * on an installed iPhone, which is exactly the kind of bug nobody files.
 */
export const THEME_COLOR = "#fcfcfb";

export const appMetadata: Metadata = {
  title: "Smart Lists",
  description: "Gemeinsame Listen für Haushalt, Einkauf und Reisen.",
  // applicationName is what Android's task switcher labels the installed app with.
  applicationName: "Smart Lists",
  // Next.js serves src/app/manifest.ts at this exact path — not /manifest.json.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    // The single field that makes iOS launch the app without Safari's chrome.
    capable: true,
    // The name under the home-screen icon. Kept short so iOS does not truncate it.
    title: "Smart Lists",
    // "default" = dark text on a light bar, which is what a #fcfcfb app wants.
    statusBarStyle: "default",
  },
  icons: {
    // iOS ignores the manifest icons entirely and only reads this link tag.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const appViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewportFit: "cover" is what makes env(safe-area-inset-*) report real values
  // on an iPhone — without it the safe-area tokens in globals.css are always 0.
  viewportFit: "cover",
  themeColor: THEME_COLOR,
  // Deliberately NO maximumScale/userScalable: pinch zoom is an accessibility
  // requirement, and iOS Safari has ignored attempts to disable it since 10.
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/pwa/app-metadata.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Point the root layout at the module**

In `src/app/layout.tsx`, replace the inline `metadata` and `viewport` exports with re-exports. Delete the `import type { Metadata, Viewport } from "next";` line (now unused) and keep the `Figtree` import untouched:

```tsx
import { Figtree } from "next/font/google";
import { appMetadata, appViewport } from "@/lib/pwa/app-metadata";
import "./globals.css";

// next/font self-hosts the font at build time (no request to Google at runtime)
// and exposes it as a CSS variable, which globals.css consumes in `body`.
// Weights 400–800 are exactly the range the design uses.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// Re-exported, not defined here: Next.js only requires the named exports to
// exist on the layout module. The objects live in src/lib/pwa/app-metadata.ts so
// a test can import them without pulling in globals.css and next/font.
export const metadata = appMetadata;
export const viewport = appViewport;
```

Leave `RootLayout` and its `lang="de"` comment exactly as they are.

- [ ] **Step 6: Verify the build still picks the metadata up**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pwa/app-metadata.ts src/lib/pwa/app-metadata.test.ts src/app/layout.tsx
git commit -m "feat(pwa): testable app metadata with iOS home-screen fields"
```

---

## Task 3: The web app manifest

**Files:**
- Create: `src/app/manifest.ts`
- Test: `src/app/manifest.test.ts`

**Interfaces:**
- Consumes: `THEME_COLOR` from `src/lib/pwa/app-metadata.ts` (Task 2); the four icon paths (Task 1).
- Produces: `export default function manifest(): MetadataRoute.Manifest`, served by Next at `/manifest.webmanifest`.

- [ ] **Step 1: Write the failing test**

Create `src/app/manifest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import manifest from "./manifest";
import { THEME_COLOR } from "@/lib/pwa/app-metadata";

/**
 * The manifest is what turns the site into an installable app. Every field here
 * is load-bearing for the install prompt, so each one is pinned rather than
 * spot-checked: a missing `display` or a mismatched icon size silently downgrades
 * the install to a plain bookmark, with no error anywhere.
 */
describe("web app manifest", () => {
  const result = manifest();

  it("identifies the app in German", () => {
    expect(result.name).toBe("Smart Lists");
    expect(result.short_name).toBe("Smart Lists");
    expect(result.lang).toBe("de");
  });

  it("launches standalone from the app root", () => {
    expect(result.start_url).toBe("/");
    expect(result.scope).toBe("/");
    expect(result.display).toBe("standalone");
  });

  it("uses the one theme colour the viewport also declares", () => {
    expect(result.theme_color).toBe(THEME_COLOR);
    expect(result.background_color).toBe(THEME_COLOR);
  });

  it("ships the icons the size guard pins, including a maskable one", () => {
    const icons = result.icons ?? [];
    expect(icons.map((icon) => icon.src)).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/maskable-512.png",
    ]);
    // Android crops a maskable icon; without one it draws a white box behind ours.
    expect(icons.find((icon) => icon.purpose === "maskable")?.sizes).toBe("512x512");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/manifest.test.ts`
Expected: FAIL — `Failed to resolve import "./manifest"`.

- [ ] **Step 3: Write the manifest route**

Create `src/app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";
import { THEME_COLOR } from "@/lib/pwa/app-metadata";

/**
 * The web app manifest, served by Next.js at /manifest.webmanifest.
 *
 * Pattern: App Router file convention. A `manifest.ts` with a default export
 * beats a static public/manifest.json because it is TypeScript-checked against
 * MetadataRoute.Manifest and can import THEME_COLOR — so the manifest and the
 * viewport meta tag cannot drift apart.
 *
 * Note on middleware: the generated path contains a dot, so the auth matcher's
 * `.*\..*` exclusion already lets it through unauthenticated. That matters —
 * a browser fetches the manifest before the user has any session.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable `id` keeps an installed app pointing at the same entry when
    // start_url ever changes; without it the OS treats it as a second app.
    id: "/",
    name: "Smart Lists",
    short_name: "Smart Lists",
    description: "Gemeinsame Listen für Haushalt, Einkauf und Reisen.",
    lang: "de",
    dir: "ltr",
    // "/" and not "/projects": an unauthenticated launch has to reach the login
    // redirect, and a signed-in launch lands on Home with the "Weitermachen" card.
    start_url: "/",
    scope: "/",
    display: "standalone",
    // The product is a one-hand phone app; a rotated shopping list helps nobody.
    orientation: "portrait",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Separate file, not the same one re-declared: a maskable icon needs its
      // glyph inside the middle 80% because Android crops it to the OS shape.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/manifest.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/manifest.ts src/app/manifest.test.ts
git commit -m "feat(pwa): web app manifest"
```

---

## Task 4: The offline fallback screen

**Files:**
- Create: `src/app/offline/page.tsx`, `src/app/offline/page.module.css`, `src/app/offline/RetryButton.tsx`
- Test: `src/app/offline/page.test.tsx`

**Interfaces:**
- Consumes: `EmptyState`, `Icon`, `Button` from `src/components/ui/`.
- Produces: the route `/offline`, statically prerendered. Task 5 exempts it from auth; Task 6's service worker precaches it under that exact path.

- [ ] **Step 1: Write the failing test**

Create `src/app/offline/page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OfflinePage from "./page";

/**
 * The screen the service worker serves when a navigation cannot reach the
 * server. It must render with no session, no props and no data — that is the
 * whole point, and it is why this test can call the page component directly.
 */
describe("offline screen", () => {
  it("explains in German that the connection is gone", () => {
    render(<OfflinePage />);
    expect(screen.getByRole("heading", { name: "Keine Verbindung" })).toBeDefined();
    expect(screen.getByText(/Sobald du wieder online bist/)).toBeDefined();
  });

  it("offers a retry action", () => {
    render(<OfflinePage />);
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/offline/page.test.tsx`
Expected: FAIL — `Failed to resolve import "./page"`.

- [ ] **Step 3: Write the retry island**

Create `src/app/offline/RetryButton.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/Button";

/**
 * The offline screen's only interactive element.
 *
 * It is its own client component so the page around it stays a Server Component
 * and can be statically prerendered — the service worker precaches that HTML at
 * install time, and a page that needed a server render could not be precached.
 *
 * location.reload() rather than a router refresh: when the network comes back we
 * want a full, cache-revalidating navigation, not a React tree update against a
 * router that is still holding the offline route.
 */
export function RetryButton() {
  return (
    <Button variant="primary" fullWidth onClick={() => window.location.reload()}>
      Erneut versuchen
    </Button>
  );
}
```

- [ ] **Step 4: Write the page and its styles**

Create `src/app/offline/page.module.css`:

```css
/* Centres the empty state in the viewport: this screen has no header and no
   navigation, so the safe-area padding lives here instead of on a PageHeader. */
.screen {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: calc(24px + var(--safe-top)) var(--screen-padding)
    calc(24px + var(--safe-bottom));
}
```

Create `src/app/offline/page.tsx`:

```tsx
import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { RetryButton } from "./RetryButton";
import styles from "./page.module.css";

/**
 * The fallback the service worker serves when a navigation request fails.
 *
 * Why force-static: the service worker precaches this route's HTML during
 * install, which only works if the response is a fixed document. Any dynamic API
 * (cookies, headers, auth) would make Next render it per request and there would
 * be nothing to cache. It also means the page must NOT read the session — which
 * is fine, because "you are offline" is the same message for everyone.
 *
 * It is exempted from the auth middleware in src/middleware.ts for the same
 * reason: without that, install-time precaching would store a /login redirect.
 *
 * The copy follows the design's empty-state pattern (handoff § Empty States):
 * glyph, one German sentence, and the action immediately below it. This is not
 * an error screen, it is an invitation to try again.
 */
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className={styles.screen}>
      <EmptyState
        icon={<Icon icon={WifiOff} size={22} />}
        tone="neutral"
        title="Keine Verbindung"
        description="Smart Lists braucht Internet, um deine Listen zu laden. Sobald du wieder online bist, geht es weiter."
      >
        <RetryButton />
      </EmptyState>
    </main>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/offline/page.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/offline
git commit -m "feat(pwa): German offline fallback screen"
```

---

## Task 5: Let the offline screen through the auth middleware

**Files:**
- Modify: `src/middleware.ts`
- Test: `src/middleware.test.ts:18-37` (extend the existing describe block)

**Interfaces:**
- Consumes: the `/offline` route (Task 4).
- Produces: `config.matcher[0]` no longer selects `/offline`.

- [ ] **Step 1: Write the failing test**

Add these two cases inside the existing `describe("middleware matcher", ...)` block in `src/middleware.test.ts`, after the `/dev` case:

```ts
  it("excludes only /offline — not /offline-mode", () => {
    // The service worker precaches this route at install time, before any user
    // has signed in. Without the exemption it would cache a /login redirect and
    // every offline navigation would show the login screen instead.
    expect(middlewareApplies("/offline")).toBe(false);
    expect(middlewareApplies("/offline-mode")).toBe(true);
  });

  it("leaves the PWA files reachable without a session", () => {
    // These pass through the matcher's `.*\..*` dot exclusion, not a named rule —
    // pinned here so a future matcher edit cannot break installability silently.
    expect(middlewareApplies("/sw.js")).toBe(false);
    expect(middlewareApplies("/manifest.webmanifest")).toBe(false);
    expect(middlewareApplies("/icons/icon-192.png")).toBe(false);
    expect(middlewareApplies("/apple-touch-icon.png")).toBe(false);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/middleware.test.ts`
Expected: FAIL on the first new case — `expected true to be false` for `/offline`. The second new case should already pass.

- [ ] **Step 3: Add the exemption**

In `src/middleware.ts`, extend the matcher and the comment. Keep every existing comment line:

```ts
// Reuses Auth.js middleware so protected pages redirect to the configured /login page without custom glue.
export { auth as middleware } from "@/auth";

export const config = {
  // Keep auth endpoints, auth pages, the Slice-13 /dev gallery, the PWA offline
  // fallback, Next internals, and public files with extensions reachable without
  // a session. /dev/* is excluded because the gallery is the manual verification
  // surface for design primitives and must open unauthenticated — the page itself
  // still 404s in production via NODE_ENV. /offline is excluded because the
  // service worker precaches it during install, when there is no session yet;
  // gated, it would cache a /login redirect and every offline navigation would
  // land on the login screen.
  // Anchor `dev` and `offline` as `…(?:/|$)` so only the exact route and its
  // children skip auth — unanchored, they would also exempt `/devices`,
  // `/developer`, `/offline-mode`, etc.
  matcher: [
    "/((?!api/auth|login|auth/error|dev(?:/|$)|offline(?:/|$)|_next/static|_next/image|.*\\..*).*)",
  ],
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/middleware.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/middleware.test.ts
git commit -m "feat(pwa): exempt /offline from the auth matcher"
```

---

## Task 6: The service worker

**Files:**
- Create: `public/sw.js`
- Test: `src/test/sw.test.ts`
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: `/offline` (Task 4), the icon paths (Task 1), `/manifest.webmanifest` (Task 3).
- Produces, as top-level bindings inside `public/sw.js` (the test reads them out of the script's scope):
  - `const CACHE_VERSION: string`
  - `const PRECACHE_URLS: string[]`
  - `function pickStrategy(url: string, mode: string): "cache-first" | "network-then-offline" | "network-only"`
  - `self` listeners for `"install"`, `"activate"`, `"fetch"`.

**Why the worker is hand-written plain JS and not bundled:** there is no build step for it, and adding one would mean a new dependency the meta plan's locked stack does not have. The whole routing decision therefore lives in one pure function that the test loads out of the real file — so there is no second copy of the logic to drift.

- [ ] **Step 1: Write the failing test**

Create `src/test/sw.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Tests the REAL public/sw.js rather than a mirrored copy of its logic.
 *
 * Pattern: script-in-a-stub-scope. A service worker is a plain classic script
 * that talks to a `self` global, so wrapping the file's source in a Function
 * whose only parameter is `self` gives it a fake worker scope. Appending a
 * `return` statement hands the file's top-level bindings back to the test —
 * which is what lets us call the pure `pickStrategy` directly instead of
 * reverse-engineering it from fetch events.
 */

type FetchHandler = (event: {
  request: { url: string; method: string; mode: string };
  respondWith: (response: unknown) => void;
}) => void;

interface SwScope {
  addEventListener: (type: string, handler: unknown) => void;
  skipWaiting: () => void;
  clients: { claim: () => void };
}

function loadServiceWorker() {
  const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
  const listeners: Record<string, unknown> = {};
  const self: SwScope = {
    addEventListener: (type, handler) => {
      listeners[type] = handler;
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };

  const factory = new Function(
    "self",
    `${source}\nreturn { pickStrategy, CACHE_VERSION, PRECACHE_URLS };`,
  ) as (scope: SwScope) => {
    pickStrategy: (url: string, mode: string) => string;
    CACHE_VERSION: string;
    PRECACHE_URLS: string[];
  };

  return { ...factory(self), listeners, self };
}

describe("service worker", () => {
  it("precaches the offline page, the manifest and every icon", () => {
    const { PRECACHE_URLS } = loadServiceWorker();
    expect(PRECACHE_URLS).toEqual([
      "/offline",
      "/manifest.webmanifest",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/maskable-512.png",
      "/apple-touch-icon.png",
    ]);
  });

  it("registers the three lifecycle listeners", () => {
    const { listeners } = loadServiceWorker();
    expect(typeof listeners.install).toBe("function");
    expect(typeof listeners.activate).toBe("function");
    expect(typeof listeners.fetch).toBe("function");
  });

  it("serves the immutable Next chunks cache-first", () => {
    const { pickStrategy } = loadServiceWorker();
    // /_next/static/* filenames carry a content hash, so a cached copy can never
    // be stale — this is the only thing worth reading from cache first.
    expect(pickStrategy("https://x.test/_next/static/chunks/main.js", "no-cors")).toBe(
      "cache-first",
    );
  });

  it("falls back to the offline page only for navigations", () => {
    const { pickStrategy } = loadServiceWorker();
    expect(pickStrategy("https://x.test/projects", "navigate")).toBe("network-then-offline");
    expect(pickStrategy("https://x.test/projects", "cors")).toBe("network-only");
  });

  it("never intercepts the API — sync and auth must always hit the network", () => {
    const { pickStrategy } = loadServiceWorker();
    // Caching a delta poll or an auth callback would hand the user stale list
    // state that looks live. True offline is Phase 2 and needs the operation
    // queue from the MVP design, not an opportunistic cache.
    expect(pickStrategy("https://x.test/api/lists/abc/delta", "cors")).toBe("network-only");
    expect(pickStrategy("https://x.test/api/auth/session", "navigate")).toBe("network-only");
  });

  it("answers a failed navigation with the cached offline page", async () => {
    const { listeners } = loadServiceWorker();
    const offlineResponse = { body: "offline" };
    // The worker reaches for caches.match("/offline") after fetch() rejects.
    vi.stubGlobal("caches", { match: vi.fn().mockResolvedValue(offlineResponse) });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    let responded: unknown;
    const handler = listeners.fetch as FetchHandler;
    handler({
      request: { url: "https://x.test/projects", method: "GET", mode: "navigate" },
      respondWith: (response) => {
        responded = response;
      },
    });

    await expect(responded).resolves.toBe(offlineResponse);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/sw.test.ts`
Expected: FAIL — `ENOENT ... public/sw.js`.

- [ ] **Step 3: Write the service worker**

Create `public/sw.js`:

```js
/*
 * Smart Lists service worker.
 *
 * SCOPE (deliberately small): this worker makes the app installable and keeps a
 * cold launch without a connection from showing the browser's error page. It is
 * NOT an offline mode. The MVP design puts real offline behind an operation
 * queue in Phase 2, and caching API responses now would show a user a stale list
 * that looks live — the one failure mode a shared shopping list cannot afford.
 *
 * Three strategies, chosen by one pure function so the whole policy is testable
 * (src/test/sw.test.ts loads THIS file, not a copy):
 *   cache-first          — /_next/static/*: content-hashed, so never stale.
 *   network-then-offline — navigations: the offline page when the network fails.
 *   network-only         — everything else, including all of /api.
 */

// Bump this string to invalidate every cached entry. The activate handler
// deletes any cache whose name is not the current version, which is what stops
// an old shell surviving a deploy.
const CACHE_VERSION = "smart-lists-v1";

// Fetched and stored during install. Only files that never change per user:
// the offline page is force-static and the icons are immutable assets.
const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/apple-touch-icon.png",
];

// The path the navigation fallback serves. Named so the precache list and the
// fetch handler cannot disagree about it.
const OFFLINE_URL = "/offline";

/**
 * The entire routing policy, as a pure function of a URL and a request mode.
 *
 * Pure on purpose: a service worker is otherwise almost untestable, and the part
 * worth testing is exactly this decision — not the plumbing around it.
 */
function pickStrategy(url, mode) {
  const path = new URL(url).pathname;

  // Checked FIRST so it wins even for a navigation: an auth callback is a
  // navigation, and answering it from a cache would break sign-in.
  if (path.startsWith("/api/")) return "network-only";

  // Next.js content-hashes these filenames, so a cached copy is correct forever
  // and a deploy simply requests new names.
  if (path.startsWith("/_next/static/")) return "cache-first";

  // A document request — this is the only thing the offline page can answer.
  if (mode === "navigate") return "network-then-offline";

  return "network-only";
}

// Install: fill the precache, then take over immediately rather than waiting for
// every open tab to close. Safe here because the worker owns no shared state.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// Activate: drop every cache from an older CACHE_VERSION, then claim the open
// clients so the new worker controls the page that installed it.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is ever cacheable, and every mutation in this app is a POST to a
  // Server Action or /api — letting them fall through keeps the worker out of
  // the write path entirely.
  if (request.method !== "GET") return;

  const strategy = pickStrategy(request.url, request.mode);

  if (strategy === "cache-first") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // Clone before returning: a Response body can only be read once, and
          // the cache write and the page both need it.
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
    return;
  }

  if (strategy === "network-then-offline") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }

  // network-only: no respondWith at all, so the browser handles the request as
  // if no service worker existed. Cheaper than proxying it through fetch().
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/sw.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Teach ESLint about service-worker globals**

`npm run lint` lints `public/sw.js` (it is not in the ignore list). Add an override to `eslint.config.mjs`, after the `globalIgnores(...)` entry and before the closing `]`:

```js
  // public/sw.js runs in a ServiceWorkerGlobalScope, not a window: `self`,
  // `caches` and `fetch` are its ambient globals. Declaring them here is what
  // keeps `npm run lint` meaningful for that file instead of a wall of no-undef.
  {
    files: ["public/sw.js"],
    languageOptions: {
      globals: {
        self: "readonly",
        caches: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Promise: "readonly",
      },
    },
  },
```

- [ ] **Step 6: Verify lint is clean**

Run: `npm run lint`
Expected: no **errors** in `public/sw.js`. Pre-existing warnings elsewhere are acceptable; new errors are not.

- [ ] **Step 7: Commit**

```bash
git add public/sw.js src/test/sw.test.ts eslint.config.mjs
git commit -m "feat(pwa): service worker with shell cache and offline fallback"
```

---

## Task 7: Registering the service worker

**Files:**
- Create: `src/lib/pwa/register.ts`, `src/lib/pwa/register.test.ts`, `src/components/pwa/ServiceWorkerRegistrar.tsx`, `src/components/pwa/ServiceWorkerRegistrar.test.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `public/sw.js` (Task 6).
- Produces:
  - `export function shouldRegisterServiceWorker(nodeEnv: string | undefined, hasServiceWorker: boolean): boolean`
  - `export function ServiceWorkerRegistrar(): null`

- [ ] **Step 1: Write the failing predicate test**

Create `src/lib/pwa/register.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldRegisterServiceWorker } from "./register";

describe("shouldRegisterServiceWorker", () => {
  it("registers in production when the browser supports workers", () => {
    expect(shouldRegisterServiceWorker("production", true)).toBe(true);
  });

  it("never registers in development", () => {
    // A worker caching /_next/static in `next dev` serves yesterday's chunks
    // after an edit, which reads as "hot reload is broken" and wastes hours.
    expect(shouldRegisterServiceWorker("development", true)).toBe(false);
    expect(shouldRegisterServiceWorker("test", true)).toBe(false);
  });

  it("never registers where the API is missing", () => {
    // Private-mode Firefox and old iOS both drop navigator.serviceWorker.
    expect(shouldRegisterServiceWorker("production", false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/pwa/register.test.ts`
Expected: FAIL — `Failed to resolve import "./register"`.

- [ ] **Step 3: Write the predicate**

Create `src/lib/pwa/register.ts`:

```ts
/**
 * Whether this page load should register the service worker.
 *
 * Why a pure predicate rather than an `if` inside the effect: the two conditions
 * are the entire policy, and both are awkward to exercise from a component test
 * (one is a build-time constant, the other a browser capability). Pulled out
 * here, the policy is three lines of test instead of two mocked environments.
 */
export function shouldRegisterServiceWorker(
  nodeEnv: string | undefined,
  hasServiceWorker: boolean,
): boolean {
  // Production only: in `next dev` the cache-first rule for /_next/static would
  // serve stale chunks after an edit and look exactly like broken hot reload.
  return nodeEnv === "production" && hasServiceWorker;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/pwa/register.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Write the failing component test**

Create `src/components/pwa/ServiceWorkerRegistrar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { ServiceWorkerRegistrar } from "./ServiceWorkerRegistrar";

/** Installs a fake navigator.serviceWorker and hands back its register spy. */
function stubServiceWorker() {
  const register = vi.fn().mockResolvedValue({});
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register },
    configurable: true,
  });
  return register;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ServiceWorkerRegistrar", () => {
  it("registers /sw.js in production", () => {
    const register = stubServiceWorker();
    vi.stubEnv("NODE_ENV", "production");

    render(<ServiceWorkerRegistrar />);

    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("does nothing in development", () => {
    const register = stubServiceWorker();
    vi.stubEnv("NODE_ENV", "development");

    render(<ServiceWorkerRegistrar />);

    expect(register).not.toHaveBeenCalled();
  });

  it("renders nothing at all", () => {
    stubServiceWorker();
    const { container } = render(<ServiceWorkerRegistrar />);
    expect(container.innerHTML).toBe("");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/components/pwa/ServiceWorkerRegistrar.test.tsx`
Expected: FAIL — `Failed to resolve import "./ServiceWorkerRegistrar"`.

- [ ] **Step 7: Write the registrar**

Create `src/components/pwa/ServiceWorkerRegistrar.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { shouldRegisterServiceWorker } from "@/lib/pwa/register";

/**
 * Registers the service worker once, on the client, after hydration.
 *
 * Why a component that renders null instead of an inline <script>: registration
 * has to happen in the browser and only under conditions the server cannot know,
 * and a null-rendering client island is the App Router's idiom for exactly that.
 * It adds no DOM, so it cannot affect layout or a hydration diff.
 *
 * The empty dependency array is the point: registering twice on a re-render
 * would be harmless but pointless, and the browser already de-duplicates.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!shouldRegisterServiceWorker(process.env.NODE_ENV, "serviceWorker" in navigator)) return;
    // Scope defaults to the script's directory, so a worker at the ORIGIN ROOT
    // is what gives it scope "/" — this is why sw.js lives in public/ and not
    // under a subfolder.
    void navigator.serviceWorker.register("/sw.js");
  }, []);

  return null;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/components/pwa/ServiceWorkerRegistrar.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 9: Mount it in the root layout**

In `src/app/layout.tsx`, add the import and render the island as the last child of `<body>`:

```tsx
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
```

```tsx
      <body>
        {children}
        {/* Renders nothing; registers /sw.js in production after hydration. */}
        <ServiceWorkerRegistrar />
      </body>
```

- [ ] **Step 10: Verify the build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add src/lib/pwa/register.ts src/lib/pwa/register.test.ts src/components/pwa src/app/layout.tsx
git commit -m "feat(pwa): register the service worker in production"
```

---

## Task 8: The Toggle tap target and the audit harness

**Files:**
- Create: `src/test/touch-targets.test.ts`
- Modify: `src/components/ui/Toggle.module.css`

**Interfaces:**
- Consumes: nothing.
- Produces: the audit harness Task 9 extends —
  - `function ruleBody(css: string, selector: string): string | null`
  - `function hasHitArea(css: string, selector: string): boolean`
  - `const CONTROLS: Array<{ file: string; selector: string }>`

**Why a CSS-parsing test and not a rendered measurement:** jsdom does not lay anything out and does not resolve CSS Modules, so `getBoundingClientRect()` returns zeros for every element. Reading the stylesheet is the only way to make the handoff's ≥44px rule enforceable in CI — the same reasoning that produced `src/test/design-tokens.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/test/touch-targets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Enforces the handoff's § PWA / Mobil rule: "Tap-Targets ≥44px".
 *
 * Why this test reads CSS text instead of measuring rendered nodes: jsdom
 * performs no layout and does not resolve CSS Modules, so every
 * getBoundingClientRect() is 0×0. The stylesheet is the only place the rule is
 * actually expressed, so the stylesheet is what gets pinned — the same approach
 * design-tokens.test.ts takes for the palette.
 *
 * A control satisfies the rule one of two ways:
 *   1. it declares min-height: 44px (or height: 44px) itself, or
 *   2. it carries the ::after hit-area expander, which centres a ≥44×44
 *      transparent box on the control without moving a drawn pixel.
 */

const files = new Map<string, string>();

/** Reads (and memoises) a stylesheet relative to the repo root. */
function readCss(relativePath: string): string {
  const cached = files.get(relativePath);
  if (cached) return cached;
  const css = readFileSync(resolve(process.cwd(), relativePath), "utf8");
  files.set(relativePath, css);
  return css;
}

/**
 * The declaration block of one exact selector, or null.
 *
 * The `\s*\{` anchor is what keeps `.track` from also matching
 * `.track[data-checked="true"]` or `.track::after` — only a brace may follow.
 */
function ruleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[1] : null;
}

function hasHitArea(css: string, selector: string): boolean {
  const own = ruleBody(css, selector);
  if (own && /(?:min-)?height:\s*44px/.test(own)) return true;

  const expander = ruleBody(css, `${selector}::after`);
  if (!expander) return false;
  // All three are required: content makes the pseudo-element exist, and the two
  // minimums are the actual 44px guarantee.
  return (
    /content:\s*""/.test(expander) &&
    /min-width:\s*44px/.test(expander) &&
    /min-height:\s*44px/.test(expander)
  );
}

// Every interactive control in the app whose drawn box is smaller than 44px.
// Task 9 extends this list; a new control that needs a finger belongs here.
const CONTROLS: Array<{ file: string; selector: string }> = [
  { file: "src/components/ui/Toggle.module.css", selector: ".track" },
];

describe("touch targets", () => {
  it.each(CONTROLS)("$file $selector offers a ≥44px hit area", ({ file, selector }) => {
    expect(hasHitArea(readCss(file), selector)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/touch-targets.test.ts`
Expected: FAIL — one case, `expected false to be true` (the 42×25 track has neither a 44px height nor an expander).

- [ ] **Step 3: Add the expander to Toggle**

Append to `src/components/ui/Toggle.module.css`. Keep the existing rules and the file's opening comment untouched:

```css
/*
 * Hit-area expander (handoff § PWA / Mobil: "Tap-Targets ≥44px").
 *
 * The design draws a 42×25 track and that measurement is binding, so the target
 * cannot be grown by resizing the control. A transparent ::after centred on the
 * track with a 44px minimum on both axes gives the finger a full target while
 * every drawn pixel stays exactly where the handoff put it. `.track` is already
 * position: relative, so the absolute child has the right containing block.
 *
 * This is the same pattern every other sub-44px control in the app uses; see
 * src/test/touch-targets.test.ts for the enforced list.
 */
.track::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/touch-targets.test.ts src/components/ui/Toggle.test.tsx`
Expected: PASS — the audit case plus the existing Toggle component tests.

- [ ] **Step 5: Commit**

```bash
git add src/test/touch-targets.test.ts src/components/ui/Toggle.module.css
git commit -m "fix(ui): 44px tap target for Toggle, with an enforcing audit test"
```

---

## Task 9: The touch-target audit across every screen

**Files:**
- Modify: `src/test/touch-targets.test.ts` (extend `CONTROLS`)
- Modify: `src/app/lists/[listId]/EntryRow.module.css`, `src/components/ui/Chip.module.css`, `src/components/ui/ChipTabs.module.css`, `src/components/ui/Button.module.css`, `src/app/admin/page.module.css`, `src/app/lists/[listId]/page.module.css`, `src/app/page.module.css`
- Modify (row pitch): `src/app/projects/[projectId]/favoriten/FavoritesEditor.module.css`, `src/app/lists/[listId]/EntrySheet.module.css`, `src/app/projects/[projectId]/NewListSheet.module.css`

**Interfaces:**
- Consumes: `hasHitArea` / `CONTROLS` from Task 8.
- Produces: no new API. Purely CSS plus the extended `CONTROLS` list.

**The violations, from a sweep of every `*.module.css`:**

| File | Selector | Drawn size | Why it matters |
|---|---|---|---|
| `EntryRow.module.css` | `.check` | 21×21 | The check circle — the single most-tapped control in the app. |
| `Chip.module.css` | `.remove` | ~14×14 | The ✕ on a Favoriten chip. |
| `Chip.module.css` | `.interactive` | 27–32px tall | Pre-fill preview chips and the entry sheet's category picker. |
| `ChipTabs.module.css` | `.tab` | ~25px tall | The list screen's category filter. |
| `Button.module.css` | `.text`, `.danger` | ~21px tall | Inline row triggers, e.g. "Zugang entziehen". |
| `admin/page.module.css` | `.rowAction` | ~30px tall | Admin table actions. |
| `lists/[listId]/page.module.css` | `.bannerAction` | ~18px tall | The "Liste abschließen" banner action. |
| `page.module.css` | `.adminLink` | ~42px tall | Home's Verwaltung link — 2px short. |

**Already compliant, deliberately not touched:** `Button .primary/.secondary` (`min-height: 44px`), `RowLink .row`, `Autocomplete .row`, `EntryRow .row`, `DrawerTrigger .trigger`, `ListMenu .trigger` (all 44px).

**The overlap trap.** A 44px expander on a control inside a **wrapped** row overlaps the neighbouring row unless the row pitch is ≥44px. The three chip containers use `gap: 6px`/`gap: 7px`, giving a pitch of ~33–39px — two rows of expanders would overlap and the wrong chip would receive the tap. That is why this task also raises `row-gap` in those three files. Controls in single-line flex rows (admin actions, banner action) are far enough apart horizontally that no gap change is needed.

- [ ] **Step 1: Extend the failing audit list**

Replace the `CONTROLS` array in `src/test/touch-targets.test.ts` with the full list:

```ts
// Every interactive control in the app whose drawn box is smaller than 44px.
// A new control that needs a finger belongs here. Controls already at 44px
// (Button .primary/.secondary, RowLink .row, Autocomplete .row, EntryRow .row,
// DrawerTrigger .trigger, ListMenu .trigger) are compliant by their own
// min-height and are deliberately absent.
const CONTROLS: Array<{ file: string; selector: string }> = [
  { file: "src/components/ui/Toggle.module.css", selector: ".track" },
  { file: "src/app/lists/[listId]/EntryRow.module.css", selector: ".check" },
  { file: "src/components/ui/Chip.module.css", selector: ".remove" },
  { file: "src/components/ui/Chip.module.css", selector: ".interactive" },
  { file: "src/components/ui/ChipTabs.module.css", selector: ".tab" },
  { file: "src/components/ui/Button.module.css", selector: ".text" },
  { file: "src/components/ui/Button.module.css", selector: ".danger" },
  { file: "src/app/admin/page.module.css", selector: ".rowAction" },
  { file: "src/app/lists/[listId]/page.module.css", selector: ".bannerAction" },
  { file: "src/app/page.module.css", selector: ".adminLink" },
];
```

Then add a second test in the same `describe` block, guarding the overlap trap:

```ts
  // Wrapped rows of expanded chips must not overlap: with a 44px hit area, two
  // rows whose pitch is smaller than 44px let the upper chip swallow taps meant
  // for the lower one. chip height + row-gap ≥ 44px is what prevents that.
  it.each([
    "src/app/projects/[projectId]/favoriten/FavoritesEditor.module.css",
    "src/app/lists/[listId]/EntrySheet.module.css",
    "src/app/projects/[projectId]/NewListSheet.module.css",
  ])("%s gives wrapped chip rows enough pitch for the expanders", (file) => {
    const body = ruleBody(readCss(file), ".chips");
    expect(body).not.toBeNull();
    const rowGap = /row-gap:\s*(\d+)px/.exec(body as string);
    expect(rowGap, "no explicit row-gap on .chips").not.toBeNull();
    expect(Number(rowGap?.[1])).toBeGreaterThanOrEqual(12);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/touch-targets.test.ts`
Expected: FAIL — 9 of the 10 hit-area cases fail (`.track` passes from Task 8) and all 3 pitch cases fail.

- [ ] **Step 3: Add the expander to the entry check circle**

Append to `src/app/lists/[listId]/EntryRow.module.css`:

```css
/*
 * Hit-area expander for the check circle (handoff § PWA / Mobil, ≥44px).
 *
 * The circle is drawn at 21×21 and that is binding, so the finger target is
 * grown with a transparent ::after instead. `.row` already guarantees 44px of
 * height, so the expander stays inside the row vertically; horizontally it
 * reaches ~11.5px toward `.body`, which starts 12px away (the row's gap) — so it
 * consumes the dead space and never covers the button that opens the entry sheet.
 */
.check {
  position: relative;
}

.check::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
}
```

- [ ] **Step 4: Add the expanders to Chip and raise the chip row pitch**

Append to `src/components/ui/Chip.module.css`:

```css
/*
 * Hit-area expanders for the two tappable chip shapes (handoff § PWA / Mobil).
 *
 * `.chip` is 27px tall and `.outline` 32px, so a fixed inset would be wrong for
 * one of them; centring a box with a 44px minimum on both axes is correct for
 * both. Non-interactive chips (plain tone, `struck` previews rendered without
 * onClick) deliberately get nothing — an invisible 44px box around a label
 * nobody can tap would only steal taps from its neighbours.
 *
 * Containers that wrap these chips must keep row-gap ≥ 12px so two rows of
 * expanders cannot overlap; src/test/touch-targets.test.ts enforces that.
 */
.interactive,
.remove {
  position: relative;
}

.interactive::after,
.remove::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
}
```

In `src/app/projects/[projectId]/favoriten/FavoritesEditor.module.css`, change the `.chips` rule:

```css
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  /* The ✕ inside each chip carries a 44px hit-area expander. An .outline chip is
     32px tall, so the rows need a 12px pitch supplement for two rows of
     expanders to stay clear of each other (32 + 12 = 44). */
  row-gap: 12px;
}
```

In `src/app/lists/[listId]/EntrySheet.module.css`:

```css
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  /* Category chips are tappable and carry a 44px hit-area expander; a plain
     .chip is 27px tall, so the rows need a 17px pitch supplement (27 + 17 = 44). */
  row-gap: 17px;
  margin-top: 10px;
}
```

In `src/app/projects/[projectId]/NewListSheet.module.css`:

```css
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  /* Pre-fill preview chips are tappable and carry a 44px hit-area expander; a
     plain .chip is 27px tall, so the rows need a 17px supplement (27 + 17 = 44). */
  row-gap: 17px;
  margin-top: 11px;
}
```

- [ ] **Step 5: Add the expander to ChipTabs**

Append to `src/components/ui/ChipTabs.module.css`:

```css
/*
 * Hit-area expander for the filter tabs (handoff § PWA / Mobil).
 *
 * The tab is ~25px tall and its 2px bottom border is the active marker, so it
 * cannot simply grow: a min-height would push the underline away from the
 * strip's hairline. A centred transparent box leaves the underline where the
 * design put it. The tabs sit 18px apart, so a 44px-wide minimum on a short
 * label ("Alle") stays clear of its neighbours.
 */
.tab {
  position: relative;
}

.tab::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
}
```

- [ ] **Step 6: Add the expanders to the inline Button variants**

In `src/components/ui/Button.module.css`, **amend** the existing comment above `.text` (do not delete it) and add the expander. The comment's original claim — that the row height guarantees the target — was only ever true of the *row*, not of the button inside it, and the button is what receives the tap:

```css
/*
 * `text` and `danger` are inline triggers that sit INSIDE dense rows (e.g. the
 * admin table's "Zugang entziehen"). They deliberately have no min-height: the
 * handoff makes the row height guarantee the 44px tap target, and forcing it
 * here would blow those rows up.
 *
 * Slice 8 amendment: the ROW being 44px tall does not make the BUTTON a 44px
 * target — only the button element receives the tap, and it is ~21px. The
 * min-height stays off for the reason above; the ≥44px guarantee now comes from
 * the transparent ::after expander below, which grows the hit area inside the
 * row without changing a single drawn pixel.
 */
.text {
  position: relative;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  padding: 2px 6px;
}

.danger {
  position: relative;
  color: var(--color-danger);
  font-size: 13px;
  font-weight: 600;
  padding: 2px 6px;
}

.text::after,
.danger::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
}
```

- [ ] **Step 7: Add the expanders to the three screen-local controls**

Append to `src/app/admin/page.module.css`:

```css
/*
 * Hit-area expander for the admin table's inline actions (handoff ≥44px).
 * `.rowActionDanger` composes `.rowAction`, so it inherits this for free.
 */
.rowAction {
  position: relative;
}

.rowAction::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
}
```

> Note: `.rowAction` already exists in this file at line 64. Add `position: relative;` as the first declaration of that existing rule rather than writing a second `.rowAction { }` block — the audit test reads the **first** matching rule, and a duplicate would make the test pass while the browser applied the wrong one. The same applies to every "add `position: relative`" instruction below.

Append to `src/app/lists/[listId]/page.module.css` (adding `position: relative;` to the existing `.bannerAction` rule):

```css
/* Hit-area expander for the completion banner's action (handoff ≥44px). */
.bannerAction::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
}
```

Append to `src/app/page.module.css` (adding `position: relative;` to the existing `.adminLink` rule):

```css
/*
 * Hit-area expander for Home's Verwaltung link. At 13px text plus 12px padding
 * it lands on ~42px — two pixels short, which is exactly the kind of miss the
 * audit test exists to catch.
 */
.adminLink::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
}
```

- [ ] **Step 8: Run the audit and every affected component test**

Run: `npx vitest run src/test/touch-targets.test.ts src/components/ui src/app/lists src/app/admin`
Expected: PASS — 10 hit-area cases, 3 pitch cases, and no regression in the existing component tests.

- [ ] **Step 9: Run the whole suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass; no new lint errors.

- [ ] **Step 10: Commit**

```bash
git add src/test/touch-targets.test.ts src/components/ui src/app
git commit -m "fix(ui): 44px tap targets across every screen"
```

---

## Task 10: The catalog vocabulary read

**Files:**
- Create: `src/lib/catalog/vocabulary.ts`, `src/lib/catalog/vocabulary.test.ts`

**Interfaces:**
- Consumes: `compareGermanText` from `src/lib/catalog/sort.ts`.
- Produces:
  ```ts
  export interface CatalogVocabulary {
    categories: string[];
    units: string[];
  }
  export function getCatalogVocabulary(
    db: PrismaClient,
    projectId: string,
  ): Promise<CatalogVocabulary>;
  ```
  Task 12 consumes it on the list page.

**Why this exists:** the list screen currently ships up to 1000 catalog rows to the client and uses that array for three different jobs — the autocomplete dropdown, the parser's unit vocabulary (`buildUnitLookup`), and the entry sheet's category chips. Task 12 moves the dropdown to a per-keystroke fetch, which would break the other two. This read replaces one enormous payload with two short string arrays, and is a strict improvement even before the dropdown change.

- [ ] **Step 1: Write the failing test**

Create `src/lib/catalog/vocabulary.test.ts`. Follow the setup of `src/lib/catalog/search.test.ts` — read it first for the exact `prisma`/`resetDb`/fixture idiom this repo uses and mirror it:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/reset-db";
import { getCatalogVocabulary } from "./vocabulary";

// Fixture identity: create a user, a project and catalog rows exactly the way
// search.test.ts does. Reuse that file's helper if it exports one; otherwise
// copy its inline creation block so both tests stay readable side by side.

describe("getCatalogVocabulary", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns the distinct default categories and units of one project", async () => {
    const projectId = await seedProjectWithCatalog([
      { name: "Milch", defaultCategory: "Molkerei", defaultUnit: "l" },
      { name: "Joghurt", defaultCategory: "Molkerei", defaultUnit: "g" },
      { name: "Äpfel", defaultCategory: "Obst", defaultUnit: null },
    ]);

    const vocabulary = await getCatalogVocabulary(prisma, projectId);

    // Distinct: "Molkerei" appears twice in the catalog, once in the vocabulary.
    expect(vocabulary.categories).toEqual(["Molkerei", "Obst"]);
    expect(vocabulary.units).toEqual(["g", "l"]);
  });

  it("drops nulls rather than surfacing them as empty chips", async () => {
    const projectId = await seedProjectWithCatalog([
      { name: "Salz", defaultCategory: null, defaultUnit: null },
    ]);

    const vocabulary = await getCatalogVocabulary(prisma, projectId);

    expect(vocabulary.categories).toEqual([]);
    expect(vocabulary.units).toEqual([]);
  });

  it("sorts categories under German rules so Ä lands next to A", async () => {
    const projectId = await seedProjectWithCatalog([
      { name: "Zucker", defaultCategory: "Zutaten", defaultUnit: null },
      { name: "Äpfel", defaultCategory: "Äpfel & Co", defaultUnit: null },
      { name: "Brot", defaultCategory: "Backwaren", defaultUnit: null },
    ]);

    const vocabulary = await getCatalogVocabulary(prisma, projectId);

    expect(vocabulary.categories).toEqual(["Äpfel & Co", "Backwaren", "Zutaten"]);
  });

  it("never leaks another project's vocabulary", async () => {
    const mine = await seedProjectWithCatalog([
      { name: "Milch", defaultCategory: "Molkerei", defaultUnit: "l" },
    ]);
    await seedProjectWithCatalog([
      { name: "Zelt", defaultCategory: "Camping", defaultUnit: "Stk" },
    ]);

    const vocabulary = await getCatalogVocabulary(prisma, mine);

    expect(vocabulary.categories).toEqual(["Molkerei"]);
    expect(vocabulary.units).toEqual(["l"]);
  });
});
```

Write `seedProjectWithCatalog` as a local helper in this file, creating a user + project + `catalogItem` rows with `normalizedName` from `normalizeName`, returning the project id — copy the shape from `search.test.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/catalog/vocabulary.test.ts`
Expected: FAIL — `Failed to resolve import "./vocabulary"`.

- [ ] **Step 3: Write the read**

Create `src/lib/catalog/vocabulary.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { compareGermanText } from "./sort";

/**
 * The two short string vocabularies a list screen needs from its catalog:
 * every default category (the entry sheet's chips) and every default unit (the
 * quantity parser's unit lookup, Slice 15).
 */
export interface CatalogVocabulary {
  categories: string[];
  units: string[];
}

/**
 * Reads a project's category and unit vocabulary — NOT its articles.
 *
 * Why it exists: before Slice 8 the list page shipped up to 1000 whole catalog
 * rows to the browser purely so three client-side helpers could each pull one
 * field out of them. Once the autocomplete dropdown fetches per keystroke
 * (useCatalogSearch), that payload has no remaining reader — but the unit lookup
 * and the category chips still need their fields. This turns a few hundred
 * kilobytes of rows into two arrays of a handful of strings.
 *
 * Pattern: `distinct` in the query rather than a Set in JS. The database is
 * already scanning these rows; making it collapse duplicates is free, and it
 * keeps the transferred row count proportional to the vocabulary, not the catalog.
 */
export async function getCatalogVocabulary(
  db: PrismaClient,
  projectId: string,
): Promise<CatalogVocabulary> {
  // Two `distinct` reads rather than one full-row read: each returns at most a
  // few dozen rows of a single column.
  const [categoryRows, unitRows] = await Promise.all([
    db.catalogItem.findMany({
      where: { projectId, defaultCategory: { not: null } },
      select: { defaultCategory: true },
      distinct: ["defaultCategory"],
    }),
    db.catalogItem.findMany({
      where: { projectId, defaultUnit: { not: null } },
      select: { defaultUnit: true },
      distinct: ["defaultUnit"],
    }),
  ]);

  // The `not: null` filters above already exclude nulls; the non-null assertions
  // below are narrowing for TypeScript, which cannot see through a Prisma filter.
  // Sorting happens in JS with the German comparator for the same reason
  // compareArticleNames exists: Postgres would order under its own collation and
  // put "Äpfel & Co" after "Zutaten".
  return {
    categories: categoryRows
      .map((row) => row.defaultCategory!)
      .sort(compareGermanText),
    units: unitRows.map((row) => row.defaultUnit!).sort(compareGermanText),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/catalog/vocabulary.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/vocabulary.ts src/lib/catalog/vocabulary.test.ts
git commit -m "feat(catalog): lean per-project category and unit vocabulary read"
```

---

## Task 11: `searchCatalog` becomes a substring search with a correct German cut

**Files:**
- Modify: `src/lib/catalog/search.ts`
- Test: `src/lib/catalog/search.test.ts`
- Modify: `src/lib/catalog/sort.ts` (amend the note that points at this slice)

**Interfaces:**
- Consumes: `compareArticleNames` from `src/lib/catalog/sort.ts`.
- Produces: `searchCatalog(db, projectId, query, limit?)` unchanged in signature, changed in behaviour — **substring** matching and German ordering applied **before** the cut. `CATALOG_DATALIST_LIMIT` still exists after this task and is deleted in Task 13, once its last caller is gone.

**Why substring and not prefix.** Today the dropdown filters an already-loaded array with `buildAutocomplete`, which uses `includes` — so typing "milch" offers "Buttermilch". Moving the search to the server on `startsWith` would silently delete that behaviour. `sort.ts:26-31` already predicted the second half of this change: the current `take: limit` in SQL means a JS sort would reorder an already-truncated page, so the cut has to move into JS.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/catalog/search.test.ts`, inside the existing describe block:

```ts
  it("matches a substring, not only a prefix", async () => {
    // The dropdown has always found "Buttermilch" from "milch" — that behaviour
    // used to come from buildAutocomplete filtering a fully-loaded catalog in
    // the browser. Once the dropdown fetches per keystroke, the SERVER has to
    // answer the same question or the behaviour silently disappears.
    const projectId = await seedProjectWithCatalog(["Milch", "Buttermilch", "Brot"]);

    const results = await searchCatalog(prisma, projectId, "milch");

    expect(results.map((item) => item.name)).toEqual(["Buttermilch", "Milch"]);
  });

  it("applies the German order BEFORE the cut, not after", async () => {
    // "Äpfel" sorts next to "Apfel" in German but after "Zucker" by code point.
    // With the cut in SQL under the database collation, a limit of 2 could drop
    // "Äpfel" entirely; ordering in JS first is what makes the cut correct.
    const projectId = await seedProjectWithCatalog(["Zucker", "Äpfel", "Apfel"]);

    const results = await searchCatalog(prisma, projectId, "", 2);

    expect(results.map((item) => item.name)).toEqual(["Apfel", "Äpfel"]);
  });
```

Use the file's existing fixture helper; if it does not have one, add `seedProjectWithCatalog(names: string[])` locally, matching the existing tests' creation block.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/catalog/search.test.ts`
Expected: FAIL — the substring case returns `["Milch"]` only; the ordering case returns whatever the Postgres collation picked.

- [ ] **Step 3: Rewrite the query**

In `src/lib/catalog/search.ts`, replace the body of `searchCatalog` and amend the comment above it. Keep `CATALOG_SEARCH_LIMIT`, `CATALOG_DATALIST_LIMIT` and `CatalogSuggestion` exactly as they are for now:

```ts
// Autocomplete read over a project's catalog (MVP design §4.4, §5). PURE READ — no writes — so it is
// safe to call on every keystroke. A blank query returns the first `limit` articles alphabetically
// (browse); a non-blank query returns SUBSTRING matches on the normalized name. Matching on
// `normalizedName` (already lowercased) with a normalized query is why "MIL" finds "Milch"
// regardless of the user's casing — no Prisma `mode: "insensitive"` needed.
//
// Slice 8 changed two things here, both because this function became the dropdown's only source of
// suggestions (the screens no longer ship the whole catalog to the browser):
//
//   1. `contains` instead of `startsWith`. buildAutocomplete filtered its in-memory array with
//      `includes`, so "milch" has always offered "Buttermilch". Keeping a prefix match on the server
//      would have deleted that behaviour without a single failing test. The lost index usage does not
//      matter at household-catalog scale (a few hundred rows per project).
//   2. The cut moved out of SQL and into JS, AFTER the German sort. sort.ts warned about exactly
//      this: with `take` in the query, the database picks the surviving rows under ITS collation, so
//      "Äpfel" could be dropped before the German comparator ever sees it. Sorting the matched set
//      and slicing here makes the cut mean what the user sees. The matched set is bounded by the
//      WHERE clause, and a blank query reads the whole catalog — the same volume the removed
//      CATALOG_DATALIST_LIMIT browse already read, except it is now cut to `limit` before it leaves.
export async function searchCatalog(
  db: PrismaClient,
  projectId: string,
  query: string,
  limit: number = CATALOG_SEARCH_LIMIT,
): Promise<CatalogSuggestion[]> {
  const normalized = normalizeName(query); // "" when the query is blank/whitespace-only

  const items = await db.catalogItem.findMany({
    where: {
      projectId, // project-scoped: the catalog is per-project memory (never cross-project)
      // Add the substring filter ONLY when there is a query; a blank query browses everything.
      ...(normalized ? { normalizedName: { contains: normalized } } : {}),
    },
    // No orderBy and no take: both happen below, in JS, under the German rules.
  });

  // Map to the lean suggestion shape (drop internal columns before they cross a boundary), then
  // order and cut. compareArticleNames is THE article-ordering rule for the whole app.
  return items
    .map((item) => ({
      id: item.id,
      name: item.name,
      defaultCategory: item.defaultCategory,
      defaultUnit: item.defaultUnit,
    }))
    .sort((a, b) => compareArticleNames(a.name, b.name))
    .slice(0, limit);
}
```

Add the import at the top of the file:

```ts
import { compareArticleNames } from "./sort";
```

- [ ] **Step 4: Amend the note in `sort.ts`**

Replace the `NOTE:` paragraph above `compareArticleNames` in `src/lib/catalog/sort.ts` (keep everything else):

```ts
// NOTE (updated in Slice 8): searchCatalog now DOES use this comparator. It previously kept Postgres'
// `orderBy: { name: "asc" }` with `take: limit` in the query, which meant a JS sort afterwards would
// only reorder an already-truncated page — and could change WHICH articles survived the cut. Slice 8
// removed the SQL `take` and moved both the sort and the cut into JS, in that order, which is exactly
// the fix this note asked for. Any new article list must still use this comparator; there is no longer
// an exception.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/catalog/search.test.ts src/lib/catalog/sort.test.ts`
Expected: PASS — including the two new cases and every pre-existing one.

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog/search.ts src/lib/catalog/search.test.ts src/lib/catalog/sort.ts
git commit -m "feat(catalog): substring search with the German cut applied before the limit"
```

---

## Task 12: The `useCatalogSearch` hook

**Files:**
- Create: `src/components/ui/useCatalogSearch.ts`, `src/components/ui/useCatalogSearch.test.tsx`

**Interfaces:**
- Consumes: `GET /api/projects/:projectId/catalog?q=` (existing route, unchanged) and `CatalogSuggestion` from `src/lib/catalog/search.ts`.
- Produces:
  ```ts
  export const CATALOG_SEARCH_DEBOUNCE_MS = 120;
  export function useCatalogSearch(
    projectId: string,
    query: string,
  ): AutocompleteArticle[];
  ```
  Tasks 13 and 14 consume it. The return type is deliberately `AutocompleteArticle[]` — the exact shape `buildAutocomplete` takes — plus `defaultUnit`, which the list screen's unit lookup needs.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/useCatalogSearch.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCatalogSearch } from "./useCatalogSearch";

/**
 * The hook is the transport half of the autocomplete. Its contract is small and
 * every part of it is a bug the user would feel: a request per keystroke drains
 * a phone, a late response overwriting a newer one shows the wrong suggestions,
 * and a request for an empty field is pure waste.
 */
describe("useCatalogSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function stubFetch(payload: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("never asks the server about an empty query", async () => {
    const fetchMock = stubFetch([]);
    const { result } = renderHook(() => useCatalogSearch("p1", "   "));

    await vi.advanceTimersByTimeAsync(500);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it("fetches the project's catalog for the typed query", async () => {
    const fetchMock = stubFetch([
      { id: "c1", name: "Milch", defaultCategory: "Molkerei", defaultUnit: "l" },
    ]);
    const { result } = renderHook(() => useCatalogSearch("p1", "mil"));

    await vi.advanceTimersByTimeAsync(200);

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p1/catalog?q=mil",
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(result.current[0]).toMatchObject({ name: "Milch", defaultUnit: "l" });
  });

  it("debounces a burst of keystrokes into one request", async () => {
    const fetchMock = stubFetch([]);
    const { rerender } = renderHook(({ query }) => useCatalogSearch("p1", query), {
      initialProps: { query: "m" },
    });

    rerender({ query: "mi" });
    rerender({ query: "mil" });
    await vi.advanceTimersByTimeAsync(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p1/catalog?q=mil",
      expect.anything(),
    );
  });

  it("percent-encodes a query so an umlaut or a space cannot break the URL", async () => {
    const fetchMock = stubFetch([]);
    renderHook(() => useCatalogSearch("p1", "rote bete"));

    await vi.advanceTimersByTimeAsync(200);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/p1/catalog?q=rote%20bete",
      expect.anything(),
    );
  });

  it("keeps the previous page while a new query is in flight", async () => {
    stubFetch([{ id: "c1", name: "Milch", defaultCategory: null, defaultUnit: null }]);
    const { result, rerender } = renderHook(({ query }) => useCatalogSearch("p1", query), {
      initialProps: { query: "mil" },
    });

    await vi.advanceTimersByTimeAsync(200);
    await waitFor(() => expect(result.current).toHaveLength(1));

    // A dropdown that empties itself on every keystroke flickers; holding the
    // last page until the next one lands is what makes it feel instant.
    rerender({ query: "milc" });
    expect(result.current).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ui/useCatalogSearch.test.tsx`
Expected: FAIL — `Failed to resolve import "./useCatalogSearch"`.

- [ ] **Step 3: Write the hook**

Create `src/components/ui/useCatalogSearch.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import type { CatalogSuggestion } from "@/lib/catalog/search";

/**
 * How long the field stays quiet before a request goes out.
 *
 * 120ms is below the ~150ms at which a delay becomes perceptible, and above a
 * fast typist's inter-key interval — so a burst of keystrokes collapses into one
 * request while the dropdown still feels immediate.
 */
export const CATALOG_SEARCH_DEBOUNCE_MS = 120;

/**
 * Fetches a page of catalog articles for a typed query.
 *
 * Why this replaced the `articles` prop: the list and Favoriten screens used to
 * server-render the project's entire catalog into the page (up to
 * CATALOG_DATALIST_LIMIT = 1000 rows) so buildAutocomplete could filter it in
 * the browser. That made every list render carry a payload proportional to the
 * catalog, and it silently capped which articles were suggestable at all.
 *
 * What did NOT move: buildAutocomplete still runs, unchanged, over whatever this
 * returns. The server answers "which articles could match", the pure function
 * answers "which three does the dropdown show, and is there a „neu anlegen" row"
 * — including all of Slice 15's raw-vs-parsed query logic. Nothing about that
 * behaviour is re-implemented on the server.
 *
 * Pattern: debounce + AbortController + last-write-wins. The abort is the part
 * that matters for correctness — without it, a slow response to "mil" can land
 * after a fast one to "milch" and repopulate the dropdown with stale options.
 */
export function useCatalogSearch(projectId: string, query: string): CatalogSuggestion[] {
  // Seeded empty and deliberately NOT cleared when the query changes: emptying
  // the list on every keystroke makes the dropdown flicker between pages.
  const [articles, setArticles] = useState<CatalogSuggestion[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    // buildAutocomplete shows nothing for an empty query, so a request would be
    // work whose result is discarded by definition.
    if (!trimmed) {
      setArticles([]);
      return;
    }

    // One controller per scheduled request. The cleanup below aborts it, which
    // covers both "the user typed again" and "the component unmounted".
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // encodeURIComponent, not template interpolation: an article name may hold
      // a space, an umlaut or an "&", all of which would otherwise corrupt the
      // query string.
      const url = `/api/projects/${projectId}/catalog?q=${encodeURIComponent(trimmed)}`;
      fetch(url, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : []))
        .then((page: CatalogSuggestion[]) => setArticles(page))
        .catch(() => {
          // An abort is the normal path (the user kept typing) and a network
          // failure is not worth an error state in a suggestion dropdown: the
          // field still works, it just offers nothing. Keep the last page.
        });
    }, CATALOG_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [projectId, query]);

  return articles;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/useCatalogSearch.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/useCatalogSearch.ts src/components/ui/useCatalogSearch.test.tsx
git commit -m "feat(catalog): debounced fetch-on-keystroke autocomplete hook"
```

---

## Task 13: Wire the list screen to the fetched dropdown

**Files:**
- Modify: `src/app/lists/[listId]/page.tsx`, `src/app/lists/[listId]/ListBody.tsx`, `src/app/lists/[listId]/ListBody.test.tsx`
- Modify: `src/lib/catalog/autocomplete.ts` (amend the doc comment)

**Interfaces:**
- Consumes: `getCatalogVocabulary` (Task 10), `useCatalogSearch` (Task 12).
- Produces: `ListBody`'s props change —
  - **removed:** `articles: AutocompleteArticle[]`
  - **added:** `projectId: string`, `units: string[]`
  - `categories: string[]` stays, now sourced from `getCatalogVocabulary` ∪ the list's own entry categories.

**The Slice-15 invariant this must preserve.** `ListBody` currently searches twice: `buildAutocomplete(articles, draft)` first, and only if that finds nothing *and* the parser peeled a quantity, `buildAutocomplete(articles, parsedDraft.name)`. Because `parsedDraft.name` is a substring of `draft`, one server query for `parsedDraft.name` returns a superset of what a query for `draft` would return — so **fetch once with the parsed name and run both local searches over that page**. Do not add a second request, and do not move `usedParsedSearch` to the server.

- [ ] **Step 1: Write the failing test**

In `src/app/lists/[listId]/ListBody.test.tsx`, update the shared props factory to the new shape and add these cases. Read the file first — it already stubs the Server Actions; keep that idiom:

```tsx
  it("offers suggestions fetched for the typed query", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "c1", name: "Milch", defaultCategory: "Molkerei", defaultUnit: "l" },
        ],
      }),
    );

    render(<ListBody {...props()} />);
    await user.type(screen.getByLabelText("Eintrag hinzufügen"), "mil");

    expect(await screen.findByRole("button", { name: /Milch/ })).toBeDefined();
  });

  it("searches the parsed article name when a quantity was typed", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    // "l" is in the project's unit vocabulary, so the parser peels "1,5 l" off
    // and the request must ask about "Mil" — asking about the raw text would
    // find nothing and the dropdown would go silent mid-word.
    render(<ListBody {...props({ units: ["l"] })} />);
    await user.type(screen.getByLabelText("Eintrag hinzufügen"), "1,5 l Mil");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/p1/catalog?q=Mil",
        expect.anything(),
      ),
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/lists/[listId]/ListBody.test.tsx`
Expected: FAIL — TypeScript/prop errors on the new `projectId`/`units` props and no fetch ever issued.

- [ ] **Step 3: Rework `ListBody`**

In `src/app/lists/[listId]/ListBody.tsx`:

1. Change the props type: drop `articles: AutocompleteArticle[]`, add `projectId: string` and `units: string[]`. Document both:

```tsx
  /** Needed to address the catalog endpoint the suggestion dropdown fetches from. */
  projectId: string;
  /**
   * The project's distinct default units, for the quantity parser's vocabulary.
   * Before Slice 8 this was derived from a full catalog prop; getCatalogVocabulary
   * now reads exactly these strings instead of a thousand rows.
   */
  units: string[];
```

2. Replace the unit-lookup line and its comment:

```tsx
  // The project's unit vocabulary. It used to be derived from the full catalog
  // prop; the server now sends exactly the distinct units, so the edge case the
  // old comment described (a project past CATALOG_DATALIST_LIMIT missing a rare
  // unit) is gone — this vocabulary is complete by construction.
  const unitLookup = buildUnitLookup(units);
```

3. Replace the two `buildAutocomplete` calls' data source. The parse must happen **before** the fetch so the query is known:

```tsx
  // The SAME parser the server runs (addEntryFromRow). Here it is used for two
  // cosmetic jobs only — the server remains the single source of truth for what
  // actually gets stored.
  const parsedDraft = parseEntryInput(draft, unitLookup);

  // ONE request, keyed on the parsed article name when the parser peeled a
  // quantity off. That is enough for BOTH local searches below: the parsed name
  // is always a substring of the raw draft, and searchCatalog matches on
  // substrings, so this page is a superset of what a raw-draft query returns.
  // Fetching twice would double the requests to answer a question one already
  // covers.
  const searchQuery = parsedDraft.quantity !== null ? parsedDraft.name : draft;
  const articles = useCatalogSearch(projectId, searchQuery);
```

4. Leave the `rawSuggestions` / `usedParsedSearch` / `suggestions` block **exactly as it is** — it now filters the fetched page instead of the full catalog, and every Slice-15 comment above it stays true. Add one line to the block's comment:

```tsx
  // Slice 8: `articles` is now a fetched page of at most CATALOG_SEARCH_LIMIT
  // matches rather than the whole catalog. Both searches below still run
  // locally and unchanged; only where the array came from moved.
```

5. Add the import: `import { useCatalogSearch } from "@/components/ui/useCatalogSearch";` and drop the now-unused `AutocompleteArticle` type import if nothing else in the file uses it.

- [ ] **Step 4: Rework the page's reads**

In `src/app/lists/[listId]/page.tsx`:

1. Replace the `searchCatalog` import with `import { getCatalogVocabulary } from "@/lib/catalog/vocabulary";`.
2. Replace the second element of the `Promise.all`:

```tsx
  // Two independent reads → Promise.all: one round-trip of latency, not two.
  const [list, vocabulary] = await Promise.all([
    getListWithItems(prisma, listId),
    // The category chips and the parser's unit vocabulary — two short string
    // arrays. Before Slice 8 this read the whole catalog (CATALOG_DATALIST_LIMIT)
    // because the dropdown filtered it in the browser; the dropdown now fetches
    // per keystroke, so the rows themselves have no reader here any more.
    getCatalogVocabulary(prisma, projectId),
  ]);
```

3. Rebuild the category set from the vocabulary:

```tsx
  // The entry sheet's chips: what the catalog remembers ∪ what this list uses.
  const categories = knownCategories(
    vocabulary.categories,
    entries.map((entry) => entry.category),
  );
```

4. Pass the new props where `<ListBody … />` is rendered: replace `articles={…}` with `projectId={projectId}` and `units={vocabulary.units}`.

> `knownCategories` currently takes `(Array<string | null>, Array<string | null>)`. `vocabulary.categories` is `string[]`, which satisfies that. Do not change its signature.

- [ ] **Step 5: Amend the `buildAutocomplete` doc comment**

The header comment in `src/lib/catalog/autocomplete.ts` describes a world where the whole catalog is a prop. Amend it — do not delete the existing text:

```ts
 * WHY this filters in the browser instead of calling GET /catalog per keystroke:
 * the screen already has the project's whole catalog as a prop (the page reads it
 * with CATALOG_DATALIST_LIMIT), a household catalog is at most a few hundred
 * articles, and a request per keystroke on a phone is the one thing this row
 * cannot afford. The server endpoint stays for any future caller.
 *
 * SLICE 8 AMENDMENT: the premise above changed. The screens no longer receive
 * the catalog as a prop — useCatalogSearch fetches a debounced page of at most
 * CATALOG_SEARCH_LIMIT matches per keystroke, and this function now ranks THAT
 * page. Everything below is unchanged and still pure; only the provenance of
 * `articles` moved. Two consequences worth knowing: the substring rule below is
 * why searchCatalog had to switch from `startsWith` to `contains` (otherwise the
 * server would pre-filter away the very matches this function looks for), and if
 * the server ever truncates at the limit, the `exists` check can offer a
 * „neu anlegen" row for an article that does exist — harmless, because
 * getOrCreateCatalogItem is idempotent on the normalized name and simply finds it.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/app/lists src/lib/catalog`
Expected: PASS — including the two new cases and every existing list/catalog test.

- [ ] **Step 7: Commit**

```bash
git add src/app/lists/\[listId\] src/lib/catalog/autocomplete.ts
git commit -m "feat(lists): fetch autocomplete suggestions per keystroke"
```

---

## Task 14: Wire Favoriten and delete `CATALOG_DATALIST_LIMIT`

**Files:**
- Modify: `src/app/projects/[projectId]/favoriten/page.tsx`, `FavoritesEditor.tsx`, `FavoritesEditor.test.tsx`
- Modify: `src/lib/catalog/search.ts` (delete the constant)

**Interfaces:**
- Consumes: `useCatalogSearch` (Task 12).
- Produces: `FavoritesEditor`'s props change — **removed:** `articles: AutocompleteArticle[]`; **added:** `projectId: string`. `CATALOG_DATALIST_LIMIT` no longer exists.

- [ ] **Step 1: Write the failing test**

In `src/app/projects/[projectId]/favoriten/FavoritesEditor.test.tsx`, update the props factory to the new shape and add:

```tsx
  it("offers suggestions fetched for the typed query", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "c1", name: "Milch", defaultCategory: "Molkerei", defaultUnit: "l" },
        ],
      }),
    );

    render(<FavoritesEditor {...props()} />);
    await user.type(screen.getByLabelText("Artikelname"), "mil");

    expect(await screen.findByRole("button", { name: /Milch/ })).toBeDefined();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/projects/[projectId]/favoriten/FavoritesEditor.test.tsx"`
Expected: FAIL — prop-type error on `projectId` and no suggestion button.

- [ ] **Step 3: Rework `FavoritesEditor`**

In `src/app/projects/[projectId]/favoriten/FavoritesEditor.tsx`:

1. Replace the `articles` prop with `projectId`:

```tsx
  /** Needed to address the catalog endpoint the suggestion dropdown fetches from. */
  projectId: string;
```

2. Replace the suggestion line:

```tsx
  // Typed text lives here now: Autocomplete is controlled, and picking a
  // suggestion must be able to submit a name the field never held.
  const [draft, setDraft] = useState("");
  // Slice 8: the catalog is fetched per keystroke instead of arriving as a prop.
  // There is no quantity parser on this screen, so the raw draft IS the query —
  // simpler than the list screen's trailing row, same hook.
  const articles = useCatalogSearch(projectId, draft);
  const suggestions = buildAutocomplete(articles, draft);
```

3. Add `import { useCatalogSearch } from "@/components/ui/useCatalogSearch";` and drop the now-unused `AutocompleteArticle` type import.
4. Amend the component's doc comment, keeping the existing paragraphs:

```tsx
 * Slice 8 replaced the `articles` prop with useCatalogSearch: the screen no
 * longer server-renders the project's whole catalog just to filter it locally.
```

- [ ] **Step 4: Rework the Favoriten page**

In `src/app/projects/[projectId]/favoriten/page.tsx`:

1. Delete the `searchCatalog` / `CATALOG_DATALIST_LIMIT` import.
2. Reduce the `Promise.all` to the single remaining read (keep the surrounding code and its comments; update the comment to say why there is only one read now):

```tsx
  // One read now, not two: the add row's dropdown fetches the catalog per
  // keystroke (useCatalogSearch), so this page no longer loads it at all.
  const favorites = await listFavorites(prisma, projectId);
```

3. Pass `projectId={projectId}` to `<FavoritesEditor />` and remove the `articles` prop.

- [ ] **Step 5: Delete the dead constant**

In `src/lib/catalog/search.ts`, remove the `CATALOG_DATALIST_LIMIT` export and its whole comment block — the meta plan's Slice 4 note said it becomes removable exactly here. Verify nothing references it:

Run: `grep -rn "CATALOG_DATALIST_LIMIT" src`
Expected: no output.

- [ ] **Step 6: Run the tests, lint and build**

Run: `npm test`
Expected: PASS — the full suite.

Run: `npm run lint && npm run build`
Expected: no new lint errors; build exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/app/projects/\[projectId\]/favoriten src/lib/catalog/search.ts
git commit -m "feat(favoriten): fetch autocomplete per keystroke; drop CATALOG_DATALIST_LIMIT"
```

---

## Task 15: The PageHeader hydration overlay

**REQUIRED SUB-SKILL:** Use `superpowers:systematic-debugging` for this task. It is an investigation, not an implementation — do not start editing components before the root cause is identified in writing.

**Files:**
- Investigate: `src/components/ui/PageHeader.tsx`, `src/components/nav/DrawerTrigger.tsx`, `src/app/projects/[projectId]/katalog/page.tsx`, `src/app/layout.tsx`
- Modify: whatever the root cause turns out to be
- Create (if the cause is not in our code): a "Closed as external" section in the slice review document

**Interfaces:** none — this task adds no API.

**The history, so the investigation does not restart from zero:**
- First reported in the Slice 10 manual verification: a hydration warning on `/katalog`, overlay citing `katalog/page.tsx`'s `PageHeader` `leading` `Link`.
- Slice 10's note says the same overlay class appears on Home and project pages via `PageHeader` — so it is **not** Katalog-specific.
- One suspected cause was **already fixed**: locale-sensitive date/number formatting. `src/lib/format/date.ts` now pins locale *and* time zone in module-level `Intl` formatters precisely so the server and client strings cannot disagree. Its header comment names this overlay as the debt it was addressing. **Do not re-fix that.**
- `PageHeader` is a Server Component with no state, no dates and no randomness. `DrawerTrigger` is a client component whose only dynamic input is `useDrawer()`. Neither has an obvious server/client divergence, which is why the remaining hypotheses lead outward.

**Ranked hypotheses to falsify, cheapest first:**
1. **A browser extension mutating the DOM before hydration** (password managers, Dark Reader, Grammarly all inject attributes into `body` and into links). React attributes the mismatch to the first differing element, which is why an innocuous `Link` gets named. **Falsify by reproducing in a clean incognito window with all extensions disabled.**
2. **Whitespace/text-node divergence in a `leading` slot** — a conditional slot that renders `""` on one side and `null` on the other.
3. **A `useId`-dependent subtree** rendering before hydration completes.
4. **Next.js dev-overlay noise** that does not occur in a production build. Check `npm run build && npm run start` as well as `npm run dev`.

- [ ] **Step 1: Reproduce with a clean profile**

Run: `npm run dev`, then open `http://localhost:3000/projects/<id>/katalog` in an **incognito window with every extension disabled**, signed in as the owner. Record whether the overlay appears. Then repeat against a production build:

```bash
npm run build && npm run start
```

- [ ] **Step 2: Record the verdict before touching any code**

Write the finding into `docs/implementation-reviews/slice-8-pwa-polish.md` under a heading `## Hydration overlay investigation`, stating: which builds were tested, whether extensions were disabled, the exact overlay text, and the identified cause.

- [ ] **Step 3: If it reproduces in a clean profile — find and fix the divergence**

Follow `superpowers:systematic-debugging`: bisect by removing slots (`trailing`, then `leading`) from one screen's `PageHeader` until the overlay disappears, which names the guilty subtree. Then write a failing test that captures the divergence before changing the component. A component test cannot see a hydration mismatch, so the test has to pin the *cause* (e.g. "the leading slot renders the same node for the same props"), not the symptom.

- [ ] **Step 4: If it does NOT reproduce in a clean profile — close it as external**

This is a legitimate outcome and the most likely one. Record in the review document that the overlay is caused by a browser extension mutating the DOM before hydration, that it does not occur in a clean profile or a production build, and that no code change is warranted. Then remove the item from the meta plan's inherited-debt list in Task 16 rather than carrying it forward.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS. (If Step 3 changed a component, its tests must still pass.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(ui): resolve the PageHeader hydration overlay"
```

(If the outcome was Step 4, commit only the review document with `docs: close the hydration overlay as an extension artefact`.)

---

## Task 16: Manual verification, review document, meta plan

**Files:**
- Create: `docs/implementation-reviews/slice-8-pwa-polish.md`
- Modify: `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`

**Interfaces:** none.

- [ ] **Step 1: Run the full verification suite**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Record the **actual** output of each: test file/count, lint error+warning counts, any pre-existing `tsc` failures (there are known inherited mock-typing errors in `RevokeSheet.test.tsx`, `CatalogBrowser.test.tsx` and `InviteForm.test.tsx` — note them as inherited and confirm no Slice 8 file is implicated). Do not claim a pass you did not observe.

- [ ] **Step 2: Run the manual browser checklist**

`npm run build && npm run start`, then on `http://localhost:3000` signed in as the owner. **A service worker only registers in a production build** — `npm run dev` will not exercise items 1–5.

1. DevTools → Application → Manifest: name, theme colour and all three icons load with no warnings.
2. DevTools → Application → Service Workers: `sw.js` is activated and running.
3. DevTools → Application → Cache Storage → `smart-lists-v1` contains `/offline`, the manifest and all four icons.
4. DevTools → Network → **Offline**, then reload a list page: the German "Keine Verbindung" screen appears, not the browser error page. "Erneut versuchen" reloads.
5. Back online, hard-reload: the app works normally and `/api/...` requests still show as network requests (never "from ServiceWorker").
6. Responsive mode at 375px: no horizontal scroll on Home, Projekte, a list, Favoriten, Katalog, Verwaltung.
7. Tap targets: with the pointer emulating touch, the Toggle in the Neue-Liste sheet, an entry check circle, a Favoriten chip ✕, a category filter tab and an admin row action are each comfortably hittable.
8. Two rows of wrapped Favoriten chips: tapping the ✕ on a chip in the lower row removes **that** chip, not the one above it.
9. List screen: type `mil` in the trailing row — the dropdown offers matches; DevTools → Network shows **one** `catalog?q=mil` request, not one per keystroke.
10. Type `1,5 l Mil` — the dropdown still offers "Milch", and submitting stores quantity 1.5, unit `l`, name "Milch".
11. Type `milch` — "Buttermilch" appears in the dropdown (the substring rule survived the move to the server).
12. Favoriten: typing in the add row offers suggestions and the „…" neu anlegen row.
13. On an iPhone (or iOS Simulator) over the LAN: Safari → Share → "Zum Home-Bildschirm", then launch from the icon. The app opens without Safari chrome, the icon is the blue tile with the white check (not a screenshot thumbnail, which is what iOS falls back to when it cannot find the apple-touch-icon), and content clears the notch and the home indicator.

Item 13 needs a real device on the same network; if it cannot be done, mark it **SKIPPED** explicitly rather than claiming a pass.

- [ ] **Step 3: Write the implementation review**

Create `docs/implementation-reviews/slice-8-pwa-polish.md` in English, covering all five required sections from CLAUDE.md § Implementation review: what was achieved, steps taken, core components built, the 5–10 most important lines with an explanation of each, and the architecture contribution. Include the hydration-overlay section from Task 15 and the real verification numbers from Step 1.

- [ ] **Step 4: Update the meta plan**

In `docs/superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md`:

1. Status table row 8 → `✅ Done / verified`, with `_to be created_` replaced by a link to `2026-09-05-slice-8-pwa-polish.md`.
2. Update the "Build order for what is left" line: only **Slice 16 (optional)** remains.
3. Add a progress log entry at the **top** of the log, following the template there: date (2026-09-05), slice, delivered, tested (real numbers), deviations from this plan and why, follow-up decisions for later slices, inherited open items, commits.
4. In the inherited-open-items line, **close** the items this slice resolved (Toggle <44px; the datalist/`CATALOG_DATALIST_LIMIT` item; the hydration overlay if Task 15 closed it) and carry forward the ones it did not (Slice 7 minors, Autocomplete arrow-key nav as a deliberate design cut, `middleware` → `proxy` migration, member-path browser smoke).

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: Slice 8 implementation review + meta plan progress log"
```

---

## Self-review

**Spec coverage.**

| Requirement | Task |
|---|---|
| Manifest | 3 |
| Service worker | 6, 7 |
| Installable / home screen | 1, 2, 3 |
| Safe areas (`env(safe-area-inset-*)`) | Already shipped (`globals.css:86-87`, `PageHeader`, `Sheet`, `ProjectShell`, `login`); Task 4 applies them to the new offline screen; Task 16 item 13 verifies on device. |
| Bottom sheets with ~30px extra bottom padding | Already shipped (`Sheet.module.css:18`). No task — verified, not rebuilt. |
| Tap targets ≥44px | 8, 9 |
| `touch-action: pan-y` on swipeable rows | Already shipped (`EntryRow.module.css:35`). No task. |
| Toggle <44px debt | 8 |
| Touch-target audit debt | 9 |
| Hydration overlay debt | 15 |
| `<datalist>` → fetch dropdown debt | 11, 12, 13, 14 |
| Definition of Done (review doc + meta plan) | 16 |

**Deliberately out of scope**, and why: an offline mutation queue and API-response caching (Phase 2 in the MVP design — caching a delta poll would show stale list state as live); a custom install prompt (`beforeinstallprompt` is not supported on iOS, the platform this product targets); push notifications (nowhere in the vision PRD); the `middleware` → `proxy` migration (the meta plan assigns it its own maintenance slice); Autocomplete arrow-key navigation (a recorded deliberate design cut, not debt).

**Type consistency check.** `THEME_COLOR` is defined in Task 2 and consumed in Task 3. `pickStrategy` / `CACHE_VERSION` / `PRECACHE_URLS` are declared in Task 6's worker and read by Task 6's test. `shouldRegisterServiceWorker` is defined and consumed in Task 7. `ruleBody` / `hasHitArea` / `CONTROLS` are created in Task 8 and extended in Task 9. `getCatalogVocabulary` returns `CatalogVocabulary { categories, units }` in Task 10 and is destructured as `vocabulary.categories` / `vocabulary.units` in Task 13. `useCatalogSearch(projectId, query): CatalogSuggestion[]` is defined in Task 12 and called with that exact signature in Tasks 13 and 14; `CatalogSuggestion` is structurally a superset of `AutocompleteArticle`, so `buildAutocomplete` accepts it unchanged. `CATALOG_DATALIST_LIMIT` survives Task 11 (still used by two pages) and is deleted in Task 14 only after both callers are gone.

**Ordering constraints.** 1 → 2 → 3 (icons before manifest; `THEME_COLOR` before the manifest). 4 → 5 → 6 (the offline route must exist and be public before the worker precaches it). 6 → 7. 8 → 9. 10 + 11 + 12 → 13 → 14 (the constant can only be deleted once both screens stop reading it). 15 and 16 last, and 16 must be last of all.
