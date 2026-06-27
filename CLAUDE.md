# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: Next.js scaffold exists

This repository now contains the initial Next.js App Router scaffold for Slice 1. The historical design documents remain the source of truth for product behavior, while the application code starts from the generated `src/app` structure.

Current commands:

- `npm run dev` — start the local Next.js development server.
- `npm run build` — create a production build.
- `npm run start` — run the production server after a build.
- `npm run lint` — run ESLint over the project.

## Language convention

- **Implementation docs (plans, design notes, READMEs), code identifiers, code comments, and this guidance file: English.** This is the new default as of 2026-06-04 and supersedes the earlier German-docs rule. Existing German specs/PRDs stay as-is; new implementation docs are written in English.
- **In-app user-facing strings stay German** — the product itself is German (UI labels, messages, content).
- **Existing canonical specs/PRDs** ([docs/superpowers/specs/](docs/superpowers/specs/)) remain in German as historical source-of-truth; do not translate them.
- **Conversation language mirrors the user.** The user may write in English or German; respond in the language they used in that message.
- **Commit messages:** either language is fine; keep them consistent within a change.

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

## Code documentation standard

All code written in this project must be **meticulously documented with inline comments**. This is a learning project and the developer reads every line to understand what is happening. Follow these rules:

- Every function gets a comment explaining what it does and **why** it exists (what problem it solves).
- Every non-obvious line or block gets an inline comment explaining the reasoning — not just what the code does, but why it does it that way.
- When a pattern (e.g. singleton, upsert, dependency injection) is used, name it and briefly explain why it was chosen.
- When a decision has a constraint behind it (a framework quirk, a design rule from the specs, a future-proofing choice), note it in a comment.
- Comments are in **English** (code identifier language); in-app user-facing strings stay German.
- Do not remove or thin out existing comments when editing a file.

## Implementation review (per slice)

After completing each implementation slice, create a review document in `docs/implementation-reviews/` named `slice-<N>-<slug>.md`. This document is for the developer to build a mental model of what was built. It must cover:

1. **What was achieved** — a plain-language summary of the slice goal and whether it was fully met.
2. **Steps taken** — brief description of each task completed and what changed.
3. **Core components built** — list each new file/function with a sentence on its role.
4. **Most important lines of code** — quote the 5–10 lines (or small blocks) that carry the most conceptual weight, with an explanation of why each is significant.
5. **Architecture contribution** — which part of the overall system architecture was assembled by this slice, and how it connects to what comes next.

The review is written in English. It is part of the Definition of Done for every slice.
