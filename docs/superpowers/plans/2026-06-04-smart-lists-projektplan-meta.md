# Smart Lists — Meta-Projektplan (MVP, Ansatz A)

> **Für agentische Worker:** Dies ist der **Dachplan** über alle 8 vertikalen Scheiben des MVP.
> Er wird **nicht** Schritt für Schritt ausgeführt — er koordiniert die Einzelpläne und führt den Fortschritt.
> Jede Scheibe hat (oder bekommt) einen eigenen, ausführbaren Plan unter `docs/superpowers/plans/`.
>
> **PFLICHT für jeden Agenten:** Wenn du einen Slice-Plan fertig umgesetzt und verifiziert hast,
> trage das Ergebnis unten im Abschnitt **[Fortschritts-Log](#fortschritts-log)** ein (siehe
> [Pflege-Anleitung](#pflege-anleitung-für-zukünftige-agenten)). Das ist Teil der „Definition of Done"
> einer Scheibe — nicht optional.

**Ziel:** Ein kollaborativer Listen-PWA-MVP (Ansatz A) gemäß
[MVP-Design](../specs/2026-06-02-smart-lists-mvp-design.md) und
[Vision-PRD](../specs/2026-06-02-smart-lists-vision-prd.md).

**Sprache:** Doku, Specs, Commit-Messages und nutzersichtbarer Text auf **Deutsch**.
Code-Identifier und technische Dateien auf Englisch (siehe [CLAUDE.md](../../../CLAUDE.md)).

---

## Festgeschriebener Tech-Stack

Dieser Stack ist die verbindliche Technologiewahl, die das MVP-Design (bewusst technologieneutral)
bislang offen ließ. Alle Slice-Pläne bauen darauf auf.

| Schicht | Wahl | Begründung |
|---|---|---|
| Frontend + API | **Next.js** (App Router, TypeScript), als installierbare PWA | Ein Repo für Frontend **und** API (Route Handlers); deckt die in der Vision angedeutete JS-Frontend + Polling-Architektur ab. |
| Auth | **Auth.js (NextAuth v5)** + Google-Provider, JWT-Session | Standard für Next.js; der `signIn`-Callback ist der natürliche Ort für das Allowlist-Gate. |
| Datenbank | **Neon** (serverless Postgres) via **Prisma ORM** | Postgres = relationale DB, passt zum verknüpften Domänenmodell. Neon = betreibt Postgres in der Cloud (inkl. Test-Branches). Prisma = typsicherer, einsteigerfreundlicher Übersetzer zwischen TypeScript und SQL. |
| Tests | **Vitest** + Testing Library | Schnell, TS-nativ, gut für TDD. |
| Hosting | **Vercel** (Plugin bereits aktiv in `.claude/settings.json`) | Native Next.js-Plattform. |

**Wichtige stack-weite Konventionen** (in allen Slices einhalten):

- **Stabile UUIDs** für alle Entitäten, client-generierbar (Vorbereitung auf Offline-Phase 2).
- **Eintragsbasierte, idempotente Operationen** als Mutationsmodell (`add_item`, `update_item`,
  `check_item`, `remove_item`) ab Scheibe 3 — API-Verträge feld-/eintrags-granular halten.
- **Jede API-Operation prüft Membership + Rolle** erneut (kein Vertrauen auf den Client).
- **Test-First (TDD)**, kleine vertikale Schnitte, häufige Commits.
- DB-Zugriff über eine **injizierbare Prisma-Instanz**, damit Logik isoliert testbar bleibt
  (siehe Testbarkeits-Schnitte, MVP-Design §7).

---

## Die 8 Scheiben (Build-Order)

Reihenfolge aus MVP-Design §9. Jede Scheibe ist für sich lauffähige, getestete Software.

| # | Scheibe | Liefert | Plan | Status |
|---|---|---|---|---|
| 1 | **Auth + Allowlist** | Scaffold, Google-Login, E-Mail-Allowlist, JIT-User-Provisioning, Admin-Seed | [2026-06-04-slice-1-auth-allowlist.md](2026-06-04-slice-1-auth-allowlist.md) | ⬜ Offen |
| 2 | **Projekte + Membership** | Projekte CRUD, Rollen (Owner/Member), Mitglieder einladen/entfernen, Berechtigungs-Guard | _noch zu erstellen_ | ⬜ Offen |
| 3 | **Listen + Einträge (Operationen)** | Listen CRUD, ListItems, eintragsbasierte Operationen, Kategorie/Menge/Einheit/Erledigt | _noch zu erstellen_ | ⬜ Offen |
| 4 | **Katalog + Autovervollständigung** | Pro-Projekt-CatalogItem, `normalized_name`, Autocomplete, Kategorie-Rückfluss | _noch zu erstellen_ | ⬜ Offen |
| 5 | **Favoriten + Vorschläge** | Favoriten pro Projekt, reine Vorschlags-Lesefunktion (Favoriten ∪ N-von-M-Statistik), Vorbefüllung | _noch zu erstellen_ | ⬜ Offen |
| 6 | **Abschluss + Archiv** | Liste abschließen (manuell + Auto-Vorschlag bei „alles abgehakt"), Archivsicht | _noch zu erstellen_ | ⬜ Offen |
| 7 | **Polling / Sync** | Cursor-basierter Delta-Endpunkt, Client-Polling (1–3 s), Last-Writer-Wins-Merge | _noch zu erstellen_ | ⬜ Offen |
| 8 | **PWA-Feinschliff** | Manifest, Service Worker, iPhone-Optimierung (Safe Areas, Home-Screen, Touch) | _noch zu erstellen_ | ⬜ Offen |

**Status-Legende:** ⬜ Offen · 🟨 In Arbeit · ✅ Fertig & verifiziert

### Abhängigkeiten zwischen den Scheiben

```
1 Auth ──> 2 Projekte/Membership ──> 3 Listen/Einträge ──> 4 Katalog ──> 5 Favoriten/Vorschläge
                                          │                                      ^
                                          ├──> 6 Abschluss/Archiv ───────────────┘
                                          └──> 7 Polling/Sync
8 PWA-Feinschliff: durchgängig, finaler Schliff am Ende.
```

- Scheibe 2 braucht 1 (Auth-Identität für Membership-Checks).
- Scheibe 3 braucht 2 (Listen leben in Projekten; Operationen prüfen Membership).
- Scheibe 4 braucht 3 (Katalog hängt an ListItems / Eingabe).
- Scheibe 5 braucht 4 (Vorschläge lesen Katalog) **und** 6 (Statistik braucht abgeschlossene Listen).
- Scheibe 6 + 7 hängen an 3.

---

## Pflege-Anleitung (für zukünftige Agenten)

Wenn du eine Scheibe abgeschlossen hast, mach **vor** dem finalen Commit Folgendes:

1. **Status-Tabelle oben aktualisieren:** Setze die Scheibe auf ✅ (oder 🟨, falls nur teilweise),
   und trage den realen Dateinamen des Slice-Plans ein, falls du ihn neu erstellt hast.
2. **Fortschritts-Log-Eintrag** unten anhängen (Vorlage siehe dort). Pflicht-Inhalte:
   - Datum, Scheibe, dein Ergebnis (was läuft jetzt, was ist getestet).
   - **Abweichungen** vom Slice-Plan und **warum** (für den Lernmodus wichtig).
   - **Folge-Entscheidungen**, die spätere Scheiben betreffen (z.B. „Session enthält jetzt `isAdmin`").
   - Offene Punkte / Schulden, die die nächste Scheibe erbt.
3. **Nächste Scheibe vorbereiten:** Wenn für die nächste Scheibe noch kein Plan existiert, erstelle ihn
   mit der `superpowers:writing-plans`-Skill, speichere ihn als
   `docs/superpowers/plans/YYYY-MM-DD-slice-N-<name>.md` und verlinke ihn in der Status-Tabelle.
4. **CLAUDE.md aktualisieren**, sobald echte Build-/Test-/Run-Befehle existieren (siehe Hinweis dort:
   „When code is added, update this file with the real build/test/run commands.").

> Halte Log-Einträge knapp und faktisch. Dieser Dachplan ist die geteilte Wahrheit über den
> Projektfortschritt — er muss stimmen, wenn ein frischer Agent ohne Kontext hier landet.

---

## Fortschritts-Log

> Neueste Einträge oben. Vorlage:
>
> ```
> ### YYYY-MM-DD — Scheibe N: <Name> — <Status>
> - **Geliefert:** …
> - **Getestet:** … (Befehl + Ergebnis)
> - **Abweichungen vom Plan:** … (oder „keine")
> - **Folge-Entscheidungen für spätere Scheiben:** …
> - **Geerbte offene Punkte:** … (oder „keine")
> - **Commit(s):** <hash(es)>
> ```

_(Noch keine Einträge — Scheibe 1 ist die erste.)_
