# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: planning stage, no code yet

This repository currently contains **only design documentation** — no application code, build system, or tests exist. There is therefore nothing to build, lint, or run yet. The immediate work is producing an implementation plan from the existing design, then scaffolding the app.

When code is added, update this file with the real build/test/run commands.

## Language convention

The project documents and the user communicate in **German**. Write specs, PRDs, commit messages, and user-facing text in German to match the existing corpus. Code identifiers and this guidance file are in English.

## Canonical documents

Read these before doing design or implementation work — they are the source of truth and supersede the older drafts:

- [docs/superpowers/specs/2026-06-02-smart-lists-vision-prd.md](docs/superpowers/specs/2026-06-02-smart-lists-vision-prd.md) — the full product vision (the target picture, independent of MVP cut).
- [docs/superpowers/specs/2026-06-02-smart-lists-mvp-design.md](docs/superpowers/specs/2026-06-02-smart-lists-mvp-design.md) — the "Approach A" lean MVP: domain model, key flows, permission matrix, test seams. This is the basis for the implementation plan.
- [docs/drafts/](docs/drafts/) — original brainstorming notes (superseded; historical context only).

## What the product is

**Smart Lists** is a collaborative PWA for everyday lists (to-do / shopping / packing), iPhone-optimized. Lists live inside **Projects**. Its distinguishing feature is **intelligent pre-filling** of new lists from a project's favorites plus a statistical rule over past completed lists.

## Architecture principles that cut across the whole design

These are the load-bearing decisions in the MVP design — honor them in any implementation, because they are expensive to retrofit:

- **Closed access.** No open signup. Login is Google identity gated by an **email allowlist**; users are just-in-time provisioned on first successful login. Every API operation re-checks project **membership and role** (Owner vs. Member; `is_admin` only for allowlist upkeep).

- **Stable, client-generated UUIDs for all entities**, so entries can be created offline and merged losslessly later — even though true offline is explicitly Phase 2, not the MVP.

- **Entry-level operations as the mutation model.** All changes are expressed as idempotent, ID-bearing operations (`add_item`, `update_item`, `check_item`, `remove_item`). Online sync is **polling with a cursor** (~1–3 s) returning deltas. Merge is per-entry; the only conflict is two writes to the same field of the same entry, resolved **last-writer-wins** (`updated_at`). This same operation shape is what lets Phase 2 add an offline queue without changing the API contracts — keep mutations entry/field-granular.

- **Per-project article catalog is the project's "memory."** A `CatalogItem` has a `normalized_name` unique per project (lowercase + trim + collapse spaces). Typing an entry autocompletes from the catalog; a new name creates a new catalog item. Editing an entry's category/unit **flows back** to update the catalog default, so future lists suggest the current category.

- **Suggestion logic is a pure read function** over the catalog and completed lists: the union of project favorites and articles appearing in **≥ N of the last M** completed lists (defaults N=2, M=4, configurable per project). No learning/weighting in the MVP.

## Build order (from the MVP design)

Auth + allowlist → Projects + membership → Lists + entries (operations) → Catalog + autocomplete → Favorites + suggestions → Completion/archive → Polling/sync → PWA polish. Prefer vertical, test-first slices; the MVP design's §7 lists the testable seams.

## Tech stack: not yet chosen

The design is deliberately technology-neutral. The vision draft *floats* (does not commit to) Vercel hosting, Neon DB, a JS frontend framework, polling, and Google auth. The Vercel Claude plugin is enabled in [.claude/settings.json](.claude/settings.json). Do not assume a stack until the implementation plan commits to one.

# Lernmodus

Ich bin Entwickler-Einsteiger und möchte beim Programmieren verstehen, *warum* Dinge
so funktionieren — nicht nur, dass sie funktionieren. Bitte halte dich an folgende
Regeln:

## Erklärungen und Arbeitsweise
- Erkläre mir mehr als du einem erfahrenen Entwickler erklären würdest
- Mache immer kleinere, schrittweise Änderungen statt großer Modifikationen auf einmal
- Erkläre bei Code-Änderungen jeden Schritt — nicht nur *was*, sondern auch *warum*
  es so funktioniert
- Erkläre neue Konzepte mit Hintergrundwissen, damit ich wirklich verstehe, was
  passiert — nicht nur kopiere
- Füge Inline-Kommentare in Code hinzu, den du schreibst oder änderst, damit ich
  nachvollziehen kann, was jeder Teil tut (ich kann sie später entfernen)
- Erinnere mich immer daran, größere Änderungen zu prüfen, bevor sie umgesetzt werden

## Signale für riskante Änderungen
- Verwende klare visuelle Signale wie "⚠️ GROSSE ÄNDERUNG" oder "🔴 HOHES RISIKO"
  bei größeren oder riskanten Änderungen
- Warte immer auf meine Bestätigung, bevor du bedeutende Modifikationen vornimmst

## Schnellmodus (nur diese Sitzung)
- Wenn ich "schnell weiter" oder etwas Ähnliches sage, wechsle für den Rest der
  Sitzung in den Schnellmodus — überspringe schrittweise Erklärungen und
  implementiere einfach effizient
- Wenn ich "zurück zum Lernmodus" oder etwas Ähnliches sage, kehre zu ausführlichen
  Erklärungen zurück
- Dieser Schalter gilt nur für die aktuelle Sitzung und ändert diese Datei nicht
