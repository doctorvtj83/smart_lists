# Smart Lists — Recipes (Rezepte) — Design

**Date:** 2026-09-13
**Status:** Approved design, ready for an implementation plan
**Supersedes:** nothing. Extends the
[MVP design](2026-06-02-smart-lists-mvp-design.md) (§3 domain model, §4.3 suggestions,
§4.5 operations) and the [UI handoff](../../design/2026-08-01-ui-handoff/README.md).

---

## 1. What this adds, and why

A project can define **recipes**: named sets of catalog articles with a quantity per article,
describing what one unit (one portion, one dish, one trip) needs. A recipe can be applied to a
list with a **count**, multiplying every quantity. Recipes can also be **derived from a completed
list**, so the knowledge a household already produced by shopping becomes reusable.

The feature is **opt-in per project** and **named by the project**: "Rezept/Rezepte" is only the
default wording. A packing project may call them "Sets", a workshop project "Pakete".

A prerequisite ships with it: **entries for the same article are merged instead of duplicated**.
Without it, applying two recipes that both need milk produces two milk rows, which defeats the
purpose of the feature.

### Locked product decisions

These were settled in the design conversation and are not open in the implementation plan:

| # | Decision |
|---|---|
| D1 | Merge rule: same article **and** same unit (where "no unit" is its own bucket), **both** entries must carry a quantity. No unit conversion — 1 l and 500 ml stay separate rows. |
| D2 | Merging happens **on add only** and only into an **unchecked** row. Editing an entry later never merges. A checked row is settled and never absorbs. |
| D3 | Recipes can be applied both when **creating a list** (as a second step in the sheet) and to an **existing open list**. |
| D4 | A recipe line is `article + optional quantity + optional unit`. A line without a quantity (Salz) is added once regardless of the count. |
| D5 | No prompt on completion. Building a recipe from a list is an entry in a **completed list's ⋮ menu**, and the flow loops so several recipes can be built from one list. |
| D6 | Quantities carried over from a list are **editable before saving** the recipe, inside the same flow. No bulk helpers (no "divide by n"). |
| D7 | The project stores a **singular and a plural label**; every user-facing string is composed from them. |
| D8 | Suggestion tuning stays out of scope. Instead the **default `suggestionRuleN` is raised 2 → 3**, migrating existing projects. |

### Out of scope (deliberately)

- Per-project editing of the suggestion rule N/M (D8). The columns exist; no UI.
- Remembering which recipes a list was built from (no "remove Lasagne again").
- Nutritional data, instructions, images, servings metadata — a recipe is a set of articles.
- Recipes in the delta/polling sync. They are low-frequency configuration (see §5).
- Unit conversion of any kind.

---

## 2. Data model

```prisma
model Project {
  // …existing fields…
  recipesEnabled      Boolean @default(false) @map("recipes_enabled")
  recipeLabelSingular String  @default("Rezept")  @map("recipe_label_singular")
  recipeLabelPlural   String  @default("Rezepte") @map("recipe_label_plural")
  suggestionRuleN     Int     @default(3) @map("suggestion_rule_n")   // was 2 (D8)
  recipes             Recipe[]
}

model Recipe {
  id             String   @id @default(uuid()) @db.Uuid
  projectId      String   @db.Uuid @map("project_id")
  project        Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name           String
  normalizedName String   @map("normalized_name")
  createdAt      DateTime @default(now()) @map("created_at")
  items          RecipeItem[]

  @@unique([projectId, normalizedName])
  @@map("recipes")
}

model RecipeItem {
  id            String      @id @default(uuid()) @db.Uuid
  recipeId      String      @db.Uuid @map("recipe_id")
  recipe        Recipe      @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  catalogItemId String      @db.Uuid @map("catalog_item_id")
  catalogItem   CatalogItem @relation(fields: [catalogItemId], references: [id], onDelete: Cascade)
  quantity      Float?      // per ONE unit of the recipe; null = "just add it"
  unit          String?     // null inherits the catalog default at apply time
  sortIndex     Int         @map("sort_index")

  @@unique([recipeId, catalogItemId])
  @@map("recipe_items")
}

model AbsorbedEntry {
  id           String   @id @db.Uuid                  // the CLIENT's itemId — no default, it IS the key
  listId       String   @db.Uuid @map("list_id")
  list         List     @relation(fields: [listId], references: [id], onDelete: Cascade)
  targetItemId String   @db.Uuid @map("target_item_id")   // NOT a FK — see below
  quantity     Float                                   // what this operation contributed
  createdAt    DateTime @default(now()) @map("created_at")

  @@map("absorbed_entries")
}
```

**Why these shapes:**

- `recipesEnabled` is a separate boolean from the labels, so turning the feature off does not
  destroy the project's chosen wording, and the labels have defaults that pre-fill the settings
  form before anyone enables anything.
- `RecipeItem` has **no name column**, exactly like `ListItem`. The article name lives on the
  catalog row (MVP design §3.1), so renaming an article in the catalog updates every recipe for
  free.
- `@@unique([recipeId, catalogItemId])`: one line per article per recipe. Two lines for the same
  article would be ambiguous under the multiplier and would merge on apply anyway.
- `Recipe.normalizedName` reuses `normalizeName` from `src/lib/catalog/normalize.ts` — the same
  identity rule the catalog uses, so "Lasagne" and " lasagne " are one recipe.
- `AbsorbedEntry.targetItemId` is deliberately **not** a foreign key with cascade. If the target
  row is later deleted, the ledger row must survive (see §3, step 3): the ledger is only ever read
  by primary key, so a stale pointer is harmless, while a cascade would silently re-enable a
  double-count.

---

## 3. Merge semantics (the operations funnel)

`applyOperation`'s `add_item` becomes merge-aware. Full order of business:

```
add_item {itemId, name, quantity, unit, category}
 1. validate quantity/unit/category                                         (unchanged)
 2. listItem with this id exists? → replay: return it / 409 cross-list      (unchanged)
 3. absorbedEntry with this id exists AND its target row still exists?
      → replay of a merge: return the target row, write nothing
 4. getOrCreateCatalogItem(name)                                            (unchanged)
 5. effectiveUnit = operation.unit !== undefined ? operation.unit : catalogItem.defaultUnit
 6. operation.quantity != null?
      find merge target: listId = list.id, catalogItemId = article.id,
                         checked = false, quantity != null,
                         unit matches effectiveUnit (both null, or equal
                         case-insensitively after trim),
                         lowest sortIndex wins
 7. target found → quantity = round3(target.quantity + operation.quantity)
                   create AbsorbedEntry{id: itemId, listId, targetItemId, quantity}
                   flow-back unchanged; return the TARGET row
    else         → create the row exactly as today; return it
```

**Step 3 is conditional on the target still existing.** If the absorbed-into row was deleted since
(swipe-to-delete), the ledger is ignored and the operation falls through to a normal create. This
is not a special case: it is exactly what `add_item` does today after a `remove_item` — the id is
free again, so the replay re-creates the entry. Keeping the two consistent means one rule, not two.

**Step 6's null-unit bucket** needs two different Prisma predicates (`unit: null` versus
`unit: { equals: u, mode: "insensitive" }`), which is why the comparison is spelled out rather
than left to one `where`. Case-insensitive because the entry sheet accepts free-text units: "L"
and "l" are the same litre.

**Step 7 changes only the quantity.** The target's category, unit spelling, `sortIndex` and
`checked` state are untouched — the existing row wins every field except the number. Otherwise a
recipe insert could silently re-categorise a row the user deliberately filed. Catalog flow-back
still fires for an explicitly supplied unit/category, because that is catalog memory and is
independent of where the entry landed.

**Rounding to 3 decimals** matches `formatGermanNumber`'s `maximumFractionDigits: 3`. Without it
`0.1 + 0.2` stores `0.30000000000000004`, which the row label would hide but the entry sheet's
MENGE field would eventually surface.

### Contract change and its callers

`applyOperation` still returns the affected row, but after a merge that row's id is **not**
`operation.itemId`. Callers must use the returned row:

- `addEntryFromRow` returns `{ item, needsCategory, merged }`. `needsCategory` is **false**
  whenever a merge happened: the row already existed and already has whatever category it has, so
  the entry sheet must not open.
- The list screen's add action passes `openEntryId` to `ListBody`; the same rule flows through it.

### What the delta sync sees

Nothing new. A merge bumps the target row's `updatedAt` (Prisma's `@updatedAt`), so Slice 7's
cursor-based delta ships it to other members like any other quantity change. The absorbed entry
never existed as a row, so it can never appear in a delta, and `AbsorbedEntry` itself is never
synced — it is a server-side idempotency ledger, not user-visible state. No change to the delta
endpoint or its cursor is required.

### Making a merge visible

A row silently changing from 2 l to 3 l reads as a bug. Two cues, both from existing primitives:

- The trailing row shows an inline `Banner`: „Zu **1 l Milch** addiert → **3 l**".
- The target row gets the 1.4 s highlight specified for remote changes (Slice 16). Here it is
  cheap, because the server tells us exactly which row changed.

---

## 4. Project settings and labels

New screen `/projects/[projectId]/einstellungen`, **owner-only** (`requireOwner` — the same gate
as renaming the project; it configures the project, not its content). It holds the recipe toggle
and the two label fields. Default state for every project, new and existing: **off**, labels
"Rezept"/"Rezepte".

All user-facing strings are composed at render time by one helper:

```ts
// src/lib/recipes/labels.ts
recipeLabels(project) => {
  singular: "Rezept",
  plural: "Rezepte",
  addToList: "Rezept hinzufügen",
  newOne: "Neues Rezept",
  fromList: "Rezept aus Liste anlegen",
  navEntry: "Rezepte",
}
```

Renaming the feature therefore needs no migration and touches no stored string. The rule that must
survive review: **no German string anywhere in the codebase hardcodes "Rezept"** outside this
helper's defaults.

---

## 5. Recipe management

New screen `/projects/[projectId]/rezepte`, **member-level** (`requireMembership` — recipes are
project content like lists, favourites and the catalog; every member cooks). The drawer/sidebar
entry appears under "Favoriten / Katalog" **only when `recipesEnabled`**, labelled with the
project's plural. The route itself re-checks the flag and 404s when off — the nav is a
convenience, the route is the gate.

```
Rezepte                                        [+ Neues Rezept]
  Lasagne            6 Artikel            >     <- RowLink
  Chili sin Carne    9 Artikel            >

Lasagne                                        ⋮ (Umbenennen / Löschen)
  500 g   Hackfleisch                     >     <- EntryRow-shaped, opens the sheet
  1 l     Milch                           >
  2       Zwiebeln                        >
  —       Salz                            >
  [ Artikel hinzufügen…                   ]     <- the list screen's trailing row, minus chips
```

**Reuse is the point.** "Artikel hinzufügen" is the list screen's trailing row without the
category chips: the same `Autocomplete`, the same `/api/projects/[id]/catalog` endpoint, the same
`parseEntryInput` parser — so typing "500 g Hackfleisch" into a recipe splits exactly as it does
on a list, and an unknown article is created via `getOrCreateCatalogItem`. Editing a line opens
the existing `EntrySheet` with the category field removed: a recipe line has no category of its
own, it inherits the article's at apply time.

Core (`src/lib/recipes/recipes.ts`), in the established shape — injectable `PrismaClient`,
`ApiError` with German messages, no auth inside:

| Function | Notes |
|---|---|
| `createRecipe(db, {projectId, id?, name})` | name rules mirror `assertValidListName`; unique violation → 409 „Ein Rezept mit diesem Namen existiert bereits" |
| `listRecipes(db, projectId)` | with item counts, sorted by `compareArticleNames` (shared German collator) |
| `getRecipeWithItems(db, recipeId)` | items by `sortIndex`, each with its `catalogItem` |
| `renameRecipe` / `deleteRecipe` | delete is unguarded: nothing depends on a recipe |
| `addRecipeItem` / `updateRecipeItem` / `removeRecipeItem` | `addRecipeItem` on an article already in the recipe **updates** that line instead of failing — otherwise the `@@unique` constraint surfaces as an error the user cannot act on |

**Recipes are not part of the operations funnel or the delta sync.** They are low-frequency
configuration edited by one person at a time; the entry-granular idempotent machinery exists for
the list screen's high-frequency collaborative editing. Concurrent recipe edits get plain
last-writer-wins on whole fields, like project rename.

Catalog deletion: Slice 10 already refuses to delete an article used by any list. That guard
extends to recipe lines — „… wird in 2 Rezepten verwendet".

---

## 6. Applying a recipe

One pure function plus a loop over the existing funnel:

```ts
// src/lib/recipes/expand.ts — no DB, fully table-testable
expandRecipe(recipe: RecipeWithItems, count: number): PlannedEntry[]
// → [{ catalogItemId, name, quantity: q === null ? null : round3(q * count), unit }, …]
```

`count` is an integer **1–99**; `expandRecipe` rejects anything else. There is no meaning to
2.5 × Lasagne, and an unbounded field is a way to create 10 000 entries by typo. A `null` quantity
stays `null` at any count (D4): Salz at ×3 is still Salz.

The **picker's** stepper ranges 0–99, where **0 means "not chosen"** and the recipe is simply left
out of the apply loop — it never reaches `expandRecipe`. Keeping the two ranges distinct is
deliberate: "apply zero units of Lasagne" is a UI state, not an operation, and letting 0 through
would make the loop emit nothing while reporting a successful apply.

Applying is then one `add_item` per planned entry through `applyOperation`, so the merge, catalog
resolution, unit inheritance and the ledger all apply with no second code path.

**Operation UUIDs are generated once, before the first write.** A half-applied recipe is therefore
safe to retry with the identical ids: landed lines replay as no-ops via the ledger, the rest
apply. No transaction, no compensating delete — the idempotency the operations model already
guarantees does the work.

### Into an existing list

`⋮ → "Rezept hinzufügen"` (project's singular), member-level, hidden on a completed list. A sheet
lists the recipes with a stepper each, then reports the result:

```
Rezept hinzufügen
  Lasagne          [− 2 +]
  Chili sin Carne  [− 0 +]
              [ Hinzufügen ]

-> Banner: „Lasagne ×2 hinzugefügt · 4 neue Einträge, 2 zusammengeführt"
```

### Into a new list

The "Neue Liste" sheet becomes two panes. Step 2 is skipped entirely — the step-1 button stays
"Liste anlegen" — when the feature is off or the project has no recipes, so nothing changes for a
project that never turns this on.

```
Schritt 1                          Schritt 2 — Rezepte
  Name: [Samstag]                    Lasagne   [− 2 +]
  Vorbefüllen  ●                     Chili     [− 1 +]
  ★Milch ★Brot Eier Butter …
                                     Milch, Eier und Butter kommen schon aus
         [ Weiter ]                  den Rezepten — sie werden nicht doppelt
                                     hinzugefügt.

                                     [ Zurück ]  [ Liste anlegen · 15 Artikel ]
```

**Ordering rule (the one real interaction between the two features):** recipes are applied
**first**, then the suggestion pre-fill adds only those articles not already on the list.

Without this, Lasagne's "3 l Milch" and the pre-fill's bare "Milch" would sit side by side and
never merge, because pre-fill adds name-only entries with no quantity and D1 requires a quantity on
both sides. The subtraction happens at the caller (the new-list action holds both sets), so the
funnel rule stays exactly as D1 states it. A suggestion is an article-level wish with no quantity;
a recipe satisfies it more precisely, so the suggestion has nothing left to contribute.

Two consequences, both required:

- **The button's count shows the deduplicated total.** 10 suggestions + 8 recipe articles with 3
  overlapping is „15 Artikel", not 18. A promised number the list does not have reads as a bug.
- **Step 2 names the overlap additively** (the note above), rather than striking chips in step 1.
  Rewriting step 1's UI from step 2 reads as the app undoing the user's choices. Both the
  suggestion set and the expanded recipes are client-side at that point, so this is a local
  computation.

---

## 7. Building a recipe from a completed list

Entry point: a **completed** list's ⋮ menu gains "Rezept aus Liste anlegen" (project's singular),
visible only when the feature is on, member-level. An open list is still being shopped, so its
quantities are not settled.

```
① Artikel auswählen                    ② Mengen für 1× festlegen
   ☑ 500 g Hackfleisch                    Name: [ Lasagne            ]
   ☑ 1 l Milch                            Hackfleisch  [ 250 ] [ g  ]
   ☑ 2 Zwiebeln                           Milch        [ 0,5 ] [ l  ]
   ☐ 1 Packung Nudeln                     Zwiebeln     [ 1   ] [    ]
   ☑ Salz                                 Salz         [     ] [    ]
        [ Abbrechen ] [ Weiter ]          [ Zurück ]  [ Rezept anlegen ]
                                                │
                                    ③ „Lasagne" angelegt · 4 Artikel
                                       Noch ein Rezept aus dieser Liste?
                                       [ Fertig ]  [ Weiteres Rezept ]
```

- **Step ① offers every entry**, checked and unchecked alike, nothing pre-selected: a shopping
  list is mostly not one dish.
- **Step ② carries the name field**, so the name sits next to the button that commits it, and
  every selected line has an editable quantity and unit pre-filled from the list entry (D6).
  Quantity input uses `parseGermanDecimal` ("0,5"); clearing it stores `null`, which is how an
  unquantified line like Salz is produced with no special UI. The unit input offers the project's
  vocabulary via the existing `buildUnitLookup`.
- **Step ③ loops.** Which entries were already consumed is **client state for the duration of the
  sheet** — a hint, not a rule, so it needs no column: an article may legitimately belong to two
  recipes (Zwiebeln in the Lasagne and in the Chili). Consumed rows are greyed but still
  selectable. Closing the sheet forgets it.

Pure builder `buildRecipeFromEntries` (testable without a DB) enforces:

- **The same article selected twice is refused, by name.** A list may hold "1 l Milch" and
  "500 ml Milch" as separate rows (D1 keeps them apart), but a recipe cannot
  (`@@unique([recipeId, catalogItemId])`). Silently picking one would lose data:
  „Milch ist zweimal ausgewählt (1 l und 500 ml) — bitte nur eine Zeile wählen."
- **An empty selection is refused**: „Wähle mindestens einen Artikel".
- `sortIndex` follows the order the entries had on the list, so a recipe built from a well-ordered
  list reads in that order.

A duplicate recipe name surfaces as the 409 from `createRecipe`, inline next to the name field.

---

## 8. Suggestion default change (D8)

`suggestionRuleN` default 2 → 3, i.e. an article is suggested when it appeared in **≥ 3 of the
last 4** completed lists. The migration must also **update existing projects** whose value is
still 2, or the change is invisible where it matters.

For the record, what the current rule actually does (verified during design): it counts **distinct
completed lists per article**, ignoring quantity entirely, so an article bought in different
amounts still counts — and every favourite is suggested unconditionally on top. The crowding is
the low threshold plus the favourites, not a quantity effect.

Existing suggestion tests pin N explicitly in their fixtures and are unaffected. Add: a new
project has N=3, and the migration updates existing rows.

---

## 9. Error handling

Cores throw `ApiError` with German messages; Server Actions catch and return them as inline form
state (`EntryFormState`), never a toast.

| Situation | Behaviour |
|---|---|
| Recipe name already exists | 409 inline next to the name field |
| Recipe deleted while its sheet is open | 404 „Dieses Rezept gibt es nicht mehr"; sheet closes, screen refreshes |
| Applying to a list completed meanwhile | 409 „Die Liste ist bereits abgeschlossen"; nothing written |
| Apply fails halfway (DB error) | Banner offers „Erneut versuchen"; retry reuses the same op ids, landed lines replay as no-ops |
| Catalog article used by a recipe is deleted | Refused by the extended Slice 10 guard: „… wird in 2 Rezepten verwendet" |
| Feature turned off while a sheet is open | Route re-checks `recipesEnabled` on submit → 404. Recipes are kept, not deleted, so re-enabling restores everything |
| `count` outside 1–99 | 400 „Anzahl muss zwischen 1 und 99 liegen" |

---

## 10. Testing (the §7 seam discipline)

**Pure, no DB**

- `expandRecipe`: multiplier arithmetic, `null` stays `null`, rounding, count bounds.
- `buildRecipeFromEntries`: duplicate-article refusal, empty selection, `sortIndex` order.
- `recipeLabels`: German string composition from a custom label pair.
- The merge **decision** extracted as a pure predicate, so the truth table is a test table: same
  article + same unit, unit case difference, both units null, one side without quantity, checked
  target, different units, different articles, multiple candidates (lowest `sortIndex` wins).

**Against the test DB**

- Merge increments the target and returns it (not the client's id).
- Ledger makes a replay a no-op; the sum does not move.
- **Replay after the target was deleted re-creates the entry** — the subtlest behaviour in the
  feature, and the consistency rule with `remove_item` (§3 step 3).
- Two merges compose to the correct sum.
- A merge leaves category, unit spelling, `sortIndex` and `checked` untouched.
- Catalog flow-back still fires on a merged add.
- Recipe CRUD incl. the unique-name collision and `addRecipeItem` updating an existing line.
- Apply end-to-end into an existing list: new rows, merged rows, counts in the result.
- New-list ordering: recipes first, suggestions minus articles already present.
- Permissions: settings owner-only, recipes member-level, both 404 for non-members.

**Component (jsdom, roles and text, never CSS-Module class names)**

- Two-step new-list sheet: the dedup count on the button, the overlap note, step 2 skipped when
  the feature is off or no recipes exist.
- Stepper bounds.
- Create-from-list: selection → editable quantities → save → the "noch ein Rezept?" loop, with
  consumed rows greyed and still selectable.
- Settings form; drawer entry present only when enabled.

---

## 11. Suggested slice cut

For the implementation plan to confirm. Three vertical slices, each shippable:

1. **Entry merging.** Schema (`AbsorbedEntry`), the pure decision function, the funnel change, the
   caller contract change (`needsCategory` / `openEntryId`), the visible cues. Independently
   valuable — it fixes duplicate rows today — and carries all the subtle idempotency behaviour, so
   it benefits from landing alone.
2. **Recipes core + management + settings.** Schema (`Recipe`, `RecipeItem`, project columns), the
   labels helper, the settings screen, the recipes screen, CRUD, the catalog-delete guard
   extension, and the `suggestionRuleN` default change.
3. **Applying and deriving.** `expandRecipe`, apply into an existing list, the two-step new-list
   sheet with the ordering rule, and the build-from-completed-list flow.

Order matters: slice 3 is where recipes pay off, and it depends on both 1 and 2.
