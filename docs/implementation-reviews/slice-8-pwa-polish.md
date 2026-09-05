# Slice 8 — PWA Polish

## 1. What was achieved

Slice 8 turns the finished Smart Lists MVP into an installable, phone-ready PWA without pretending that
the MVP supports offline data editing. It adds app metadata and generated icons, a production-only
service worker with a static German navigation fallback, a repository-wide 44px touch-target audit,
and fetch-on-keystroke catalog autocomplete shared by list entries and favorites.

The implementation is complete within its intended scope, with two explicit manual-verification
caveats. The worker deliberately never caches API responses or mutations; real offline collaboration
remains a Phase 2 operation-queue feature. Vitest passes with **84 test files / 659 tests**, but the
repository-wide verification is not wholly green: full lint fails on generated leftover
`.worktrees/.next` output, and standalone `tsc` reports inherited test-mock errors. The production
browser checklist passed items 1–3 and 5–12.

Item 4 was **SKIPPED**, not passed: the available Cursor/Electron embed cannot apply page-level CDP
Offline to the service-worker network target and paints its own main-frame interstitial when localhost
is unreachable. Installability, an activated and controlling `/sw.js`, the populated
`smart-lists-v1` cache with German `/offline` HTML, and the real-worker `sw.test.ts` rejected-navigation
case stand in as coverage of the prerequisites and fallback branch; they do **not** replace the missing
browser end-to-end observation of the German page and its “Erneut versuchen” action. Item 13 was also
**SKIPPED** because no iPhone or iOS Simulator was available on the LAN.

Verification details:

- `npm test` — first attempt hit a transient Prisma advisory-lock timeout; the clean retry exited 0
  with **84 files / 659 tests passed**.
- `npm run lint` — exited 1 with **374 errors / 4,536 warnings**, caused by generated
  `.worktrees/slice-15-quantity-parsing/.next/**` output. A targeted run over every changed Slice 8
  `src/` file exited 0 with **0 errors / 14 inherited warnings** in `ListBody.test.tsx`.
- `npx tsc --noEmit` — exited 2 with the five known inherited mock-typing errors in
  `RevokeSheet.test.tsx`, `CatalogBrowser.test.tsx`, and `InviteForm.test.tsx`; no Slice 8 file was
  reported.
- `npm run build` — exited 0 under Next.js 16.2.9. The inherited `middleware` → `proxy` deprecation
  warning remains.
- Production browser — manifest/icons, active worker, `smart-lists-v1` precache, online hard reload,
  network-only API behavior, six 375px layouts, representative 44px touch targets, wrapped-chip
  removal, one-request autocomplete debounce, quantity-aware completion, substring search, and
  favorites autocomplete all passed as the authenticated owner.

## 2. Steps taken

1. **Installability contract and icons.** Extracted testable root metadata and viewport values, added
   the typed App Router manifest, generated 192px, 512px, maskable, and 180px Apple icons from the
   existing login mark, and pinned their dimensions, transparency, and safe-zone geometry in tests.
2. **Offline navigation shell.** Added a force-static German `/offline` screen, exempted it from auth,
   and built `public/sw.js` around three explicit request strategies: cache-first hashed chunks,
   network-then-offline navigations, and network-only everything else.
3. **Production registration.** Added a null-rendering client registrar that installs `/sw.js` only
   in production-capable browsers. Registration, lifecycle policy, precache contents, API exclusions,
   and cache-write lifetime are covered by tests against the real worker script.
4. **Touch-target closure.** Expanded every visually small control to at least 44px without changing
   its drawn size, kept tabs inside their clipping scrollport, and increased wrapped-chip row pitch so
   neighboring invisible hit areas cannot overlap. A CSS-source audit now prevents regressions.
5. **Lean catalog reads.** Replaced the old whole-catalog page props with
   `getCatalogVocabulary`, which returns only distinct categories and units needed by the list screen.
6. **Server-backed autocomplete.** Preserved the existing substring behavior, moved German sorting
   before the result cut, added a debounced/abortable catalog hook, and adopted it in both `ListBody`
   and `FavoritesEditor`. The obsolete `CATALOG_DATALIST_LIMIT` path was then removed.
7. **Hydration investigation and production verification.** Isolated the residual
   `data-cursor-ref` mismatch to browser tooling, confirmed clean development and authenticated
   production controls, and added `trustHost: true` so local `next start` can authenticate for the
   production-only checks.
8. **Definition-of-Done verification.** Ran the full command suite and the feasible production browser
   checklist. Temporary favorites, list entries, and the temporary `Buttermilch` catalog article used
   by the interaction checks were removed afterward.

## 3. Core components built

- **`appMetadata`, `appViewport`, and `THEME_COLOR` (`src/lib/pwa/app-metadata.ts`)** — the testable
  installability and iOS viewport contract shared by the root layout and manifest.
- **`manifest` (`src/app/manifest.ts`)** — the typed web-app manifest with standalone display,
  portrait orientation, stable identity, and purpose-specific icons.
- **Generated icon set (`public/icons/`, `public/apple-touch-icon.png`)** — platform-ready artwork,
  including a maskable safe-zone variant and the Apple-specific icon ignored by the manifest path.
- **Offline route (`src/app/offline/`)** — a force-static German fallback plus a small client-only
  reload button, kept public so the worker can precache its actual HTML.
- **Service worker (`public/sw.js`)** — versioned shell precaching and a deliberately narrow routing
  policy that never caches API or mutation traffic.
- **`ServiceWorkerRegistrar` and `shouldRegisterServiceWorker`** — production-only registration
  separated into a null-rendering client island and a pure, unit-tested environment predicate.
- **Touch-target CSS audit (`src/test/touch-targets.test.ts`)** — a central inventory that accepts
  either a 44px control or a 44px transparent pseudo-element and also checks wrapped-row spacing.
- **`getCatalogVocabulary` (`src/lib/catalog/vocabulary.ts`)** — two distinct-column reads replacing
  transfer of up to 1,000 full catalog rows to every list page.
- **`searchCatalog` (`src/lib/catalog/search.ts`)** — project-scoped substring search whose German
  application ordering happens before the visible result limit.
- **`useCatalogSearch` (`src/components/ui/useCatalogSearch.ts`)** — shared 120ms debounce,
  URL-safe query construction, cancellation, stale-response prevention, and non-blocking failure
  behavior for both autocomplete consumers.
- **List and favorites integrations (`ListBody.tsx`, `FavoritesEditor.tsx`)** — both screens now fetch
  only the current suggestion page while retaining the existing `buildAutocomplete` selection and
  “neu anlegen” rules.

## 4. Most important lines of code

### Keep browser chrome, manifest, and CSS background on one color contract

```ts
export const THEME_COLOR = "#fcfcfb";

export const appViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: THEME_COLOR,
};
```

`viewportFit: "cover"` activates real safe-area inset values on iOS. Sharing one theme constant with
the manifest prevents a visible seam between the installed app and system chrome.

### Give platforms purpose-specific icon declarations

```ts
icons: [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
],
```

The maskable artwork is a separate safe-zone file rather than a relabelled ordinary icon. iOS receives
its own `apple-touch-icon` through root metadata because Safari does not rely on these manifest icons.

### Make the service-worker policy explicit and small

```js
if (path.startsWith("/api/")) return "network-only";
if (path.startsWith("/_next/static/")) return "cache-first";
if (mode === "navigate") return "network-then-offline";
return "network-only";
```

The order is load-bearing: auth callbacks and every API request bypass caching even when they are
navigations. Only immutable build assets and the static navigation fallback participate in CacheStorage.

### Keep the failed-navigation response inside the worker

```js
if (strategy === "network-then-offline") {
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
}
```

This is the complete offline promise for the MVP: replace a browser error page with useful German copy.
It does not imply cached list data, queued writes, or any stale state presented as live.

### Register only after hydration and only where supported

```ts
useEffect(() => {
  if (!shouldRegisterServiceWorker(process.env.NODE_ENV, "serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/sw.js");
}, []);
```

The null-rendering client island keeps registration out of SSR and development while giving a root
worker scope to every production route.

### Enforce invisible 44px hit areas in CI

```ts
return (
  /content:\s*""/.test(expander) &&
  /min-width:\s*44px/.test(expander) &&
  /min-height:\s*44px/.test(expander)
);
```

Small visual controls can stay faithful to the handoff while their pseudo-element receives the finger.
The audit inventories every such exception and separately protects wrapped rows from overlapping targets.

### Preserve substring behavior and cut under German ordering

```ts
...(normalized ? { normalizedName: { contains: normalized } } : {}),
// ...
return items
  .map((item) => ({ /* lean suggestion fields */ }))
  .sort((a, b) => compareArticleNames(a.name, b.name))
  .slice(0, limit);
```

`contains` preserves the former local rule (`milch` finds `Buttermilch`). Sorting before slicing prevents
database collation from deciding which articles survive the user-visible limit.

### Collapse keystroke bursts and reject stale responses

```ts
const controller = new AbortController();
const timer = setTimeout(() => {
  const url = `/api/projects/${projectId}/catalog?q=${encodeURIComponent(trimmed)}`;
  fetch(url, { signal: controller.signal })
    .then((response) => (response.ok ? response.json() : []))
    .then((page: CatalogSuggestion[]) => setArticles(page));
}, CATALOG_SEARCH_DEBOUNCE_MS);
```

The 120ms delay produced one `catalog?q=mil` request in production while still feeling immediate. Each
effect owns an abort controller, so an older slow response cannot overwrite a newer query.

### Keep quantity parsing compatible with the remote page

```ts
const searchQuery = parsedDraft.quantity !== null ? parsedDraft.name : draft;
const articles = useCatalogSearch(projectId, searchQuery);
```

`1,5 l Mil` asks the server for `Mil`, not for the entire raw input. The existing local
raw-versus-parsed selection logic then preserves numeric article names and reattaches the quantity only
when a parsed completion was actually chosen.

## 5. Architecture contribution

Slice 8 adds the delivery shell around the completed online MVP. Metadata, icons, safe-area activation,
touch geometry, and production service-worker registration now make the same Next.js application
installable and comfortable on the iPhone form factor it was designed for. The worker is intentionally
not a second data layer: list truth still comes from authenticated server renders, Server Actions, the
operations endpoint, and Slice 7 polling.

The catalog change removes the last page-size dependency on project history. Categories and units are
small server-supplied vocabularies; suggestions are short, query-specific pages; mutations still flow
through the existing Server Actions and `applyOperation`. That split is ready for larger real catalogs
without introducing client-owned domain state.

The next architectural step is optional Slice 16's per-row remote-change flash. It can consume the
existing polling delta and `data-item-id` seam without changing this slice's PWA shell. True offline
editing remains Phase 2 and must reuse stable UUIDs plus entry operations through a durable queue,
rather than broadening `sw.js` into an unsafe API cache.

**Deviations and remaining items:** local production authentication required `trustHost: true` in
`src/auth.ts`, which was not in the original Slice 8 plan but is necessary for honest `next start`
verification. The inherited `middleware` → `proxy` migration and member-path browser smoke remain open.
Autocomplete arrow-key navigation remains a deliberate design cut. The Slice 8 minor that
`search.test.ts` still describes the behavior as “starts with” although the implementation is substring
matching is left for later cleanup. A real Chrome/DevTools run should still exercise live offline
navigation and the retry action when that environment is available; this is a verification follow-up,
not reopened service-worker product debt.

## Hydration overlay investigation

The residual `PageHeader` hydration warning is closed as an external browser-tooling artefact; no application-code change is warranted.

- **Original instrumented development reproduction:** Next.js 16.2.9 with Turbopack via `npm run dev`, using an existing owner session. The warning was reproduced on Home and then inspected on the project page. The isolated browser profile exposed no third-party extensions (only Chromium's built-in PDF plugins), but Cursor's accessibility snapshot tooling was active.
- **Exact overlay text:** `A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up.` The component frame cited `src/components/ui/PageHeader.tsx (41:7) @ PageHeader`. Its diff showed the server without an extra attribute and the client with `data-cursor-ref="e5"` on the `<h1>Smart Lists</h1>`.
- **Root cause:** `data-cursor-ref` is not emitted anywhere in this repository. It is injected by the browser automation's accessibility snapshot so later actions can address elements. Taking that snapshot while React was still hydrating modified the server-rendered `<h1>` and produced the warning. A second, DOM-neutral navigation in the same authenticated browser session to `/projects/e675b6fa-1318-41bd-a9f8-d5ba008e77db/katalog` completed with zero `[data-cursor-ref]` elements and no issue badge or hydration overlay; the rendered heading had only its CSS-module `class`.
- **Clean-profile development control:** Next.js 16.2.9 with Turbopack via `npm run dev -- --port 3001` was tested in a new browser page, authenticated as owner, at `/projects/e675b6fa-1318-41bd-a9f8-d5ba008e77db/katalog`. Extensions were disabled: the page exposed only Chromium's built-in PDF plugins. Navigation was initiated through CDP from a blank page, and no Cursor accessibility snapshot or screenshot ran during first paint or hydration. After `document.readyState` reached `complete`, the Katalog page remained authenticated, its `<h1>` was `<h1 class="PageHeader-module__HZea0q__title">Katalog</h1>`, the DOM contained zero `[data-cursor-ref]` elements, and the Next.js portal had no error flag or visible error dialog. **Hydration overlay text: none.**
- **Application hypotheses falsified:** `PageHeader` renders `leading`, `title`, and `trailing` directly and contains no conditional server/client branch. The Katalog `leading` slot is always `<DrawerTrigger />`; that component reads stable context and renders a fixed button. Neither this subtree nor the project layout uses `useId`. The historical leading `Link` was replaced by `DrawerTrigger` in commit `2f06b3b`, while the same warning was reported with both versions, consistent with React naming the first externally mutated element rather than a faulty slot.
- **Authenticated production control:** The existing Next.js 16.2.9 production build served by `npm run start` on port 3000 was tested in a second new browser page with the same extension-free profile and owner session. Navigation again started through CDP from a blank page without an accessibility snapshot or screenshot during first paint. The protected URL stayed on `/projects/e675b6fa-1318-41bd-a9f8-d5ba008e77db/katalog` rather than redirecting to `/login`; the page rendered all ten catalog items and `<h1 class="PageHeader-module__HZea0q__title">Katalog</h1>`. At `document.readyState === "complete"`, there were zero `[data-cursor-ref]` elements, zero `nextjs-portal` elements, and no error dialog. **Hydration overlay or mismatch text: none.**

Verdict: the exact observed mismatch was introduced by browser tooling before hydration, not by server/client divergence in Smart Lists. It does not reproduce in the required clean-profile development run or on the authenticated Katalog page in the production build. The locale/date formatting fix remains untouched, and rewriting `PageHeader` or its slots would only mask an external test artefact.
