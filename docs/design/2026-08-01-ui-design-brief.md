# Smart Lists — UI Design Brief

**Date:** 2026-08-01 (revised 2026-08-01 after the structure review)
**Purpose:** Compact input for generating UI design mockups. Describes the feature scope and every
area of the app.
**Sources:** [Vision PRD](../superpowers/specs/2026-06-02-smart-lists-vision-prd.md),
[MVP design](../superpowers/specs/2026-06-02-smart-lists-mvp-design.md),
[admin area design](../superpowers/specs/2026-07-26-admin-area-design.md), and the implemented pages
under `src/app/`.

> **Read this first — built vs. planned.** Slices 1–7 + 9 are shipped, but this brief describes the
> app **after a structural rework** decided on 2026-08-01: the overloaded project screen is split into
> separate screens behind a project drawer, and the list screen gets an inline entry model with
> category filter chips. Every screen below is marked **[gebaut]** (exists today, mockups restyle it)
> or **[neu]** (does not exist yet; mockups define it and the roadmap builds it). The functionality is
> the same either way — nothing here is a new feature except the editable catalog.

---

## 1. The product in one paragraph

**Smart Lists** is a collaborative app for everyday lists — shopping, to-do, packing. Lists live inside
**Projects** (e.g. "Haushalt", "Camping") that are shared with a handful of people: a household or a small
team. Its distinguishing feature is **intelligent pre-filling**: a new list can be created already filled
with the project's favorites plus the articles that keep showing up in recent completed lists. Access is
closed — no signup, Google login gated by an admin-managed email allowlist.

## 2. Design constraints (non-negotiable)

- **Mobile-first, iPhone-optimized PWA.** Design for a phone held one-handed, installed to the home
  screen: safe areas, thumb-reachable primary actions, large tap targets. A desktop/tablet layout is
  welcome but secondary.
- **All user-facing text is German.** Use the exact German labels quoted in this brief.
- **Frequent, fast micro-interactions.** The core loop is standing in a supermarket ticking off items
  with one thumb. Checking an item must be the easiest thing on the screen.
- **Near-real-time collaboration, not hard realtime.** Other members' changes appear within ~2 seconds.
  Design a *calm* indication of remote change — no cursors, no presence avatars, **no permanent sync
  indicator**.
- **Todoist-like structure.** A project drawer for everything you touch rarely; the list itself stays
  clean and content-first.
- **Currently a plain server-rendered app with zero styling** (unstyled HTML forms and lists). The
  mockups define the visual language from scratch; there is no existing design system to match.

## 3. Users and roles

| Role | Who | What they see |
|---|---|---|
| **Mitglied** (member) | Anyone in a project | Full read/write on lists, entries, catalog, favorites. Can create, complete and delete lists. |
| **Owner** | Creator of a project | Everything a member can do, plus: invite/remove members, rename and delete the project. |
| **Admin** (`is_admin`, global) | One or two people | Additionally sees the "Verwaltung" area: manage who may log in at all. Orthogonal to project roles. |

Owner-only and admin-only controls are simply **not rendered** for people without the right — design for
the absence, not for disabled buttons.

## 4. Core concepts (glossary — needed to label things correctly)

| Concept | German label | Meaning |
|---|---|---|
| Project | **Projekt** | Container for lists, an article catalog and favorites. Shared with members. |
| List | **Liste** | Belongs to a project. Status: aktiv or abgeschlossen. |
| List entry | **Eintrag** | Article + Menge (quantity) + Einheit (unit) + Kategorie + checked state. |
| Article / catalog | **Artikel** / **Katalog** | Per-project memory of every article ever used, with its default category and unit. Powers autocomplete and the statistic. Has **its own screen** where articles can be renamed, re-defaulted and deleted. |
| Favorite | **Favorit** | Article pinned per project; always pre-filled into new lists. Shared by all members. Has its own screen. |
| Category | **Kategorie** | Free text on an entry, inherited from the catalog default. Not a managed entity — a category exists exactly as long as some entry carries it. |
| Archive | **Archiv** | Completed lists, kept in the project; they feed the suggestion statistic. |
| Allowlist | **Zugang** | Emails permitted to log in. |

---

## 5. Navigation model

Two navigation surfaces, deliberately different in weight:

**The project drawer (☰)** — everything you open rarely. Same content on phone (drawer) and desktop
(fixed sidebar). The project name at the top doubles as the project switcher (▾).

**Category chips** — a horizontal, swipeable filter strip directly above the list content. Categories
are a **filter, not navigation**: you switch them dozens of times per shopping trip, so they sit flat on
the content and stay in thumb reach. They never live in the drawer.

### 5.1 Liste, filter "Alle" (default)

```
┌────────────────────────────────┐
│ ☰   Einkauf Samstag          ⋮ │  ⋮ = abschließen / löschen
├────────────────────────────────┤
│ ●Alle  Obst  Molkerei  Tiefk… →│  ← chips, horizontally swipeable
├────────────────────────────────┤
│  OBST & GEMÜSE                 │
│  ☐  Äpfel                1 kg  │
│  ☑  B̶a̶n̶a̶n̶e̶n̶                    │
│                                │
│  MOLKEREI                      │
│  ☐  Milch              1,5 l   │
│  ☐  Butter                     │
│                                │
│  OHNE KATEGORIE                │
│  ☐  Grillanzünder              │
│                                │
│  ＋ ________________________   │  ← always the last row
└────────────────────────────────┘
```

### 5.2 Chip "Molkerei" active

```
┌────────────────────────────────┐
│ ☰   Einkauf Samstag          ⋮ │
├────────────────────────────────┤
│  Alle  Obst  ●Molkerei  Tiefk…→│
├────────────────────────────────┤
│  ☐  Milch              1,5 l   │  no group heading —
│  ☐  Butter                     │  the chip IS the heading
│  ☐  Joghurt            500 g   │
│                                │
│  ＋ Neu in „Molkerei" ______   │  ← auto-assignment, visible
│                                │     in the placeholder text
└────────────────────────────────┘
```

### 5.3 Drawer open — project navigation only

```
┌──────────────────┬─────────────┐
│  HAUSHALT      ▾ │             │
│                  │  ☐ Milch    │
│  ▸ Listen        │  ☐ Butter   │
│    Archiv        │             │
│  ────────────    │             │
│    Favoriten     │             │
│    Katalog       │             │
│    Mitglieder    │             │
│  ────────────    │             │
│    Verwaltung  ⚙ │             │  admins only
│    Abmelden      │             │
└──────────────────┴─────────────┘
```

### 5.4 Desktop — same structure, no drawer

```
┌───────────────┬────────────────────────────────────┐
│ HAUSHALT    ▾ │  Einkauf Samstag              ⋮   │
│               ├────────────────────────────────────┤
│ ▸ Listen      │  ●Alle  Obst  Molkerei  Tiefkühl  │
│   Archiv      ├────────────────────────────────────┤
│ ───────────   │  OBST & GEMÜSE                     │
│   Favoriten   │  ☐  Äpfel                   1 kg   │
│   Katalog     │  ☑  B̶a̶n̶a̶n̶e̶n̶                       │
│   Mitglieder  │  MOLKEREI                          │
│               │  ☐  Milch                 1,5 l    │
│               │  ＋ ____________________________   │
└───────────────┴────────────────────────────────────┘
```

Chip rules that the design must respect:

- **Chip order is stable**: alphabetical, "Ohne Kategorie" always last. Chips must not reorder under the
  user's thumb when entries are added.
- **The active chip survives becoming empty.** If another member removes the last entry of the category
  you are filtered to, you stay there and see an empty state — you are never silently thrown back to
  "Alle".
- **Chips are derived**, not managed: the strip is exactly the set of categories present on this list's
  entries. A new category appears the moment an entry carries it; the last entry leaving a category
  makes its chip disappear (subject to the rule above).

---

## 6. The screens

Eleven screens. Routes are given as anchors, not as UI text.

### 6.1 Login — `/login` **[gebaut]**
The only screen visible without a session.
- Title "Smart Lists — Anmeldung"
- One sentence explaining the closed access: "Der Zugang ist geschlossen. Melde dich mit einem
  freigeschalteten Google-Konto an."
- One button: "Mit Google anmelden"
- Design opportunity: this is the app's first impression — brand moment, product logo/wordmark.

### 6.2 Access denied — `/auth/error` **[gebaut]**
Shown when a Google account is not on the allowlist.
- "Zugang nicht freigeschaltet" + explanation that an administrator has to unlock the address
- Link back: "Zurück zur Anmeldung"
- Tone: friendly dead end, not an error page. No retry loop.

### 6.3 Home — `/` **[gebaut]**
Deliberately thin today; the natural place for a proper app shell / dashboard in the mockups.
- "Smart Lists", "Angemeldet als: <email>"
- Link "Zu meinen Projekten"
- Link "Verwaltung" — **admins only**
- Button "Abmelden"
- Design opportunity: this could become the real landing surface (recent lists, quick jump into the
  list the user is most likely to continue). Feel free to propose that.

### 6.4 Projects overview — `/projects` **[gebaut]**
- Heading "Projekte"
- Create form: one field ("Projektname") + button "Projekt anlegen"
- Flat list of the user's projects, each linking to its detail page
- **Empty state needed:** a person with no project yet.
- Expect 1–5 projects, rarely more. Cards vs. rows is an open design question.

### 6.5 Project detail — `/projects/[projectId]` **[gebaut, wird stark entlastet]**
Once the busiest screen; after the split it is **only about lists**. Everything else moved into the
drawer.

1. **Header** — the project name is **inline-editable**: tap/click the name, it becomes a text field,
   Enter or blur saves. No separate "Projekt umbenennen" form anywhere. Owner-only — for members the
   name is plain text. Next to it the user's own role ("Deine Rolle: Owner | Mitglied").
2. **Listen** — the active lists, newest first, each linking to its detail page. Plus **two distinct
   creation paths that must stay visually distinguishable**:
   - "Liste anlegen" (name field) → an empty list
   - "Vorbefüllte Liste anlegen" (name field) → a list already filled from favorites + statistic,
     opening straight into the list detail page. **This is the product's signature feature — give it
     weight.** Wanted entries stay, unwanted ones get removed.
3. **Owner-only:** "Projekt löschen". Destructive action needs the visual treatment to match. (Invite
   and remove members now live on the members screen, §6.9.)
- **Empty state needed:** project without lists.

### 6.6 Archive — `/projects/[projectId]/archiv` **[neu]**
Moved out of the project screen into its own drawer entry.
- Completed lists, newest-completed first, with the completion date (`31.12.2026`).
- Each links to its list detail page, which renders in the frozen/archived state.
- Reads as a calm, receded record — this is history, not a work surface.
- **Empty state needed:** nothing completed yet.

### 6.7 Favorites — `/projects/[projectId]/favoriten` **[neu]**
The shared, always-pre-filled articles. Previously a block on the project screen.
- Add by typing an article name (autocomplete from the project catalog; a brand-new name creates the
  article), button "Als Favorit".
- Each favorite has "Entfernen".
- Expect 5–30 favorites — chips/tags would suit this.
- Explain the payoff on the screen: these articles land in **every** pre-filled list.
- **Empty state needed:** no favorites yet.

### 6.8 Catalog — `/projects/[projectId]/katalog` **[neu — the only new capability]**
The project's memory, made visible and editable. Previously invisible (autocomplete only).
- A searchable list of every article the project has ever used, with its **Standard-Kategorie** and
  **Standard-Einheit**.
- Per article: **umbenennen**, change the two defaults, **löschen**.
- **Renaming collides**: two articles must never end up with the same normalized name ("Milch" vs.
  " milch "). The design needs an inline error for that: "Artikel existiert bereits".
- **Deleting is restricted**: an article can only be deleted if it appears in **no** list, active or
  archived. Otherwise the delete control is absent and the reason is stated ("Wird in 3 Listen
  verwendet"). This protects the suggestion statistic, which reads past lists per article.
- Expect 50–300 articles → search/filter and a scannable dense row layout matter more than decoration.
- **Empty state needed:** brand-new project with an empty catalog.

### 6.9 Members — `/projects/[projectId]/mitglieder` **[neu]**
Previously a block plus an owner-only block on the project screen.
- Every member with email and role. Expect 2–6 members.
- Owner-only: "Mitglied einladen" (email field + "Einladen") and an "Entfernen" button per non-owner
  member. For members the screen is read-only.
- The owner is marked and can never be removed.

### 6.10 List detail — `/lists/[listId]` **[gebaut, Interaktionsmodell neu]**
This is where users spend their time, usually standing up, one-handed, possibly on a bad connection.

- **Header** — list name, back link "← Zum Projekt", overflow "⋮" for abschließen / löschen.
- **Category chips** — see §5. In "Alle" the entries stay grouped under category headings; inside a
  filtered category the headings disappear because the chip already names the group.
- **Entries** — in stable manual order within each group. Per entry:
  - a check control (☐ / ☑) — the primary, biggest tap target
  - display name from the catalog, struck through when checked
  - quantity/unit appended as "Milch — 1,5 l"
  - a "Löschen" action (a swipe gesture is the natural mobile pattern here)
- **No add-entry form.** Instead there is **always a trailing empty row** (Apple Erinnerungen / Todoist):
  type into it, Enter creates the entry and opens the next empty row. Article name only — that is the
  whole interaction. The row's placeholder states where the entry will land: "Neu in „Molkerei"" when a
  chip is active, plain "Eintrag hinzufügen" in "Alle".
  - In a filtered category, the new entry gets **that category**, overriding the catalog default.
  - In "Alle", it inherits the catalog default, or lands in "Ohne Kategorie" if there is none.
  - Autocomplete from the project catalog happens inline in this row.
- **Entry detail sheet** — tapping an entry (not its checkbox) opens a small sheet with **Menge**
  (decimal, German comma), **Einheit** and **Kategorie**. This is the only place quantities are entered.
  Editing category or unit here **flows back** into the catalog default, so future lists suggest it.
  - *Not in this design, deliberately deferred:* parsing quantities out of the typed text
    ("Milch 1,5 l"). See §8.
- **Completion**, one of two states:
  - *open list:* "Liste abschließen" in the ⋮ menu. Once **every** entry is checked, an auto-suggest
    prompt appears at the top: "Alle Einträge sind abgehakt. Liste abschließen?" — a moment worth
    designing as a small celebration/nudge.
  - *completed list:* "✓ Abgeschlossen am <Datum>" plus "Wieder öffnen" (the undo). Entries stay
    visible and readable; the whole screen should read as archived/frozen; the trailing empty row is gone.
- **Live sync** — the page polls every ~2s and re-renders when another member adds, checks, edits,
  removes, renames or completes something. **No permanent indicator.** Design only a brief, quiet signal
  at the moment content actually changed — and nothing at all while things are calm. Conflicts are
  resolved server-side (last writer wins); do not design conflict UI — there is none.
- **States to cover:** empty list, list with 3 items, list with 40 items across 6 categories, filtered to
  one category, filtered to a category that just became empty, all-checked list, completed list.

### 6.11 Administration — `/admin` ("Verwaltung") — admins only **[gebaut]**
Small, rare-use, consequence-heavy screen. Non-admins are redirected away; it simply does not exist
for them.

- **Block "Zugang"** — a table, one row per allowlisted email:
  - the email
  - status: the person's display name, or "Noch nie angemeldet"
  - admin: "Ja"/"Nein" with a grant/revoke control — only when the person has logged in at least once;
    otherwise a note that they must sign in once first
  - a button "Zugang entziehen"
  - the admin's own row renders **without buttons** and is marked "(du)"
- **Block "E-Mail einladen"** — one field + button. Note for the design: no invitation email is sent —
  the person is told out of band.
- **Two-step revoke — the piece that needs the most design care.** Choosing "Zugang entziehen" opens a
  confirmation panel showing every project the person belongs to and their role there, then offers two
  clearly different outcomes:
  - **"Nur Zugang entziehen"** — reversible: no new logins, memberships stay, re-inviting restores them.
    A running session keeps working until it expires.
  - **"Zugang entziehen und aus allen Projekten entfernen"** — immediate and **not undoable by
    re-inviting**: memberships are gone; project access ends on the person's next request.
  These two must be unmistakably distinguishable — picking the wrong one cannot be undone from this page.
  If the person never logged in, only the plain revoke is offered.
- Afterwards, projects the person **owns** are listed with a note that they keep access there (owner
  memberships are never removed).
- **Honest wording throughout:** the action is "Zugang entziehen", never "Nutzer entfernen" — nothing is
  deleted except an allowlist row and, on request, memberships.

## 7. Cross-cutting UI needs

- **Empty states** for: no projects, project without lists, empty list, empty category under an active
  chip, no favorites, empty catalog, empty archive.
- **Inline editing** is now a recurring pattern (project name, entry rows, catalog rows). It needs one
  shared treatment: what an editable field looks like at rest, on focus, while saving, and on error.
- **Error messages** are short German sentences (e.g. "Nutzer nicht gefunden", "Der Owner kann nicht
  entfernt werden", "Artikel existiert bereits"). A consistent inline-error pattern near the causing
  control is needed; there is none today.
- **Destructive actions** (delete project, delete list, delete catalog article, revoke access, remove
  member) need one shared visual language and a confirmation pattern.
- **Dates** are German-formatted (`31.12.2026`), decimals use a comma.
- **Offline/connection feedback:** not built yet, but the app is meant to feel usable on a bad
  connection — a place for a lightweight connection indicator. This is separate from sync activity,
  which gets no permanent indicator at all.

## 8. Out of scope — please do not design these

- Signup, password reset, profile editing, avatars (identity comes from Google; there is no profile screen).
- Notifications, reminders, due dates, subtasks, time tracking.
- A viewer/read-only role, per-project admin, ownership transfer.
- Weighted/learning suggestions, cross-project insights.
- **Parsing quantity/unit out of the typed entry text** ("2 Dosen Tomaten"). Explicitly deferred to a
  later roadmap step so an uncertain heuristic does not block the inline entry model. Design the
  trailing row as name-only.
- Categories as a managed entity (renaming a category everywhere, category colors/icons, a category
  admin screen). A category is free text on an entry; the chips are derived from that.
- Deleting users; user/project dashboards for admins beyond the allowlist table.
- Conflict-resolution UI, presence indicators, chat/comments.
- Native iOS chrome — this is a PWA.

## 9. What this brief changes for implementation

For the roadmap consequences of the structural rework described here, see the
[meta project plan](../superpowers/plans/2026-06-04-smart-lists-projektplan-meta.md) — slices 10–12.
