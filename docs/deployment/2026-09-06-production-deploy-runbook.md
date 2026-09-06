# Production Deploy Runbook (first release)

**Goal:** Smart Lists running on Vercel, reachable and installable from an iPhone, with a production
database that contains **no projects** and exactly **one user** — `volkertjaden@gmail.com`, with
`is_admin = true`.

**Status before this runbook:** no Vercel project, no `vercel.json`, no CI workflow, no production
database. Everything below is a one-time setup; afterwards a push to `main` deploys automatically.

**Progress:** Phase A done 2026-09-06 — `dev` branch created and verified, `.env` points at it
(`ep-fragrant-night-…`); `production` (`ep-ancient-king-…`) still holds the old development data and
is wiped in Phase E. Phase B done in commit `66ecd8a`. Phase C: project `smart-lists` created; the
first two deploys failed **after** a green build with
`The Edge Function "_middleware" size is 1.02 MB and your plan size limit is 1 MB` — fixed by the
auth split described below.

> **The Edge-bundle trap.** `src/middleware.ts` used to re-export `auth` from `src/auth.ts`, which
> imports the Prisma singleton. Middleware compiles to an Edge Function capped at 1 MB on Hobby, and
> the chain `middleware → auth → lib/db → @prisma/client` pulled the Prisma query-engine WASM in —
> for a function that never runs a query. The config is now split: `src/auth.config.ts` holds the
> database-free half (providers, session strategy, pages, `authorized` + `session` callbacks), and
> the middleware builds its own NextAuth instance from it. Bundle: **1.02 MB → 316 KB**.
> `src/test/middleware-edge-bundle.test.ts` walks the import graph and fails if the chain returns.

Phase C done 2026-09-06: deploy `smart-lists-9v8mb0dot` is Ready, functions in `fra1`, middleware
122.83 KB, Deployment Protection off for production. Production alias:
**https://smart-lists-jade.vercel.app**. Verified over HTTP: `/` → 307 to `/login`, `/login` 200,
`/manifest.webmanifest` 200, `/sw.js` 200, `/offline` 200, both icons 200, `/dev/ui` **404**,
`/api/auth/providers` 200. Phase D done: the production OAuth client is the same one dev uses
(`349563812777-hhfia7fej…`), confirmed by reading `client_id` out of the live sign-in redirect;
sign-in from the phone worked. Phase E done: production went from 2 users / 2 projects / 9 lists /
18 items to **0 users, 0 projects, 1 allowlist entry** (`volkertjaden@gmail.com`). Phase F done:
sign-in provisioned the user, the second seed run set `is_admin = true`, verified end state is
**1 user (admin), 1 allowlist entry, 0 projects**. Phase G (iPhone) outstanding.

> **Wiping data invalidates live sessions in a way the middleware does not catch.** After the
> truncate, the phone still held a JWT naming a user id that no longer existed. `requireUserId`
> trusts the JWT deliberately (only `/admin` pays for a live DB check), so the app would have let the
> request through and then failed on a foreign key when creating a project. Sign out and back in
> after any wipe — and again after the admin promotion, since `is_admin` is minted into the token at
> login.

**Owner-only steps** are marked 🔑 — they need a login (Neon, Vercel, Google Cloud) that an agent
does not have.

---

## Phase A — Neon: three branches with clear roles

Today the Neon project has two branches, and the default branch (named `production`) has been used
for **development**. Target layout:

| Branch | Role | Used by |
|---|---|---|
| `production` | real production data | Vercel (Production environment) |
| `dev` | local development | `.env` |
| `test` | throwaway; truncated by every DB test | `.env.test` |

Order matters: **copy first, wipe second.** Neon branches are copy-on-write, so creating `dev` from
`production` is instant and lossless, and the existing `test` branch is a separate snapshot that a
later reset of `production` does not touch.

1. 🔑 **Neon → Branches → Create branch**: name `dev`, parent `production`, "from current state".
   All existing development data is now in `dev`.
2. 🔑 Copy the **pooled** connection string of `dev` (`...-pooler.eu-central-1.aws.neon.tech`) into
   the local `.env` as `DATABASE_URL`. Update the comment above it to say `dev branch`.
3. Verify before touching anything else: `npm run dev`, sign in, confirm the existing projects and
   lists are all there. If they are not, **stop** — do not continue to step 4.
4. 🔑 Copy both connection strings of `production` somewhere safe: the **pooled** one (for the app)
   and the **direct/unpooled** one (for migrations). Do not put either into `.env`.

The wipe of `production` happens later, in Phase E — after `dev` has been proven good.

> **Guardrail that already exists:** `src/test/global-setup.ts` refuses to run if `.env` and
> `.env.test` resolve to the same `DATABASE_URL`. It does not know about the production URL, so the
> production URL is never written to a file in this repo — it is passed inline on the command line
> (Phase E) and stored in Vercel.

---

## Phase B — Repository preparation (done)

- `package.json` `build` is now `prisma generate && next build`. **Why:** Vercel caches
  `node_modules` between builds, so `@prisma/client`'s `postinstall` hook does not reliably re-run;
  without an explicit `prisma generate` the deployed bundle can carry a Prisma Client generated from
  an older schema. Running it in `build` is the pattern Prisma documents for cached CI environments.
- `vercel.json` pins `"regions": ["fra1"]`. Neon runs in `eu-central-1`; Vercel's default is US East,
  which puts an Atlantic crossing on every query. This started as a dashboard setting, but the first
  successful deploy still placed every function in `iad1` — in the repo it is reproducible and cannot
  be lost. Plain JSON and not `vercel.ts`, which would pull in `@vercel/config` for a single value.
  (JSON has no comments, which is why the rationale lives here.)
- Nothing about secrets changes: `.gitignore` already excludes every `.env*` except the examples.

Commit and push these changes to `main` before creating the Vercel project.

---

## Phase C — Vercel project

1. 🔑 vercel.com → **Add New → Project** → import `doctorvtj83/smart_lists`. Framework detection:
   Next.js. Do **not** deploy yet — add the environment variables in the import screen first.
2. 🔑 Environment variables, **scope: Production only** (leave Preview/Development empty for now):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon **`production`, pooled** connection string |
   | `AUTH_SECRET` | a **fresh** secret, not the dev one — `openssl rand -base64 32` |
   | `GOOGLE_CLIENT_ID` | from Google Cloud (Phase D) |
   | `GOOGLE_CLIENT_SECRET` | from Google Cloud (Phase D) |

   Pooled, not direct: Vercel Functions are serverless and open many short-lived connections, which
   is exactly what Neon's pooler exists for.
3. 🔑 Deploy. The first build should succeed even though the database is still empty — no page in
   this app is statically prerendered from the database.
4. 🔑 **Settings → Deployment Protection → Vercel Authentication → "Only Preview Deployments".**
   With the default "Standard Protection" every production request — including `/login`,
   `/manifest.webmanifest` and the Google OAuth callback — is 302'd to `vercel.com/sso-api`, so the
   app is unreachable from a phone and the PWA cannot install. The app's own gate is the allowlist
   plus Google sign-in; the Vercel layer in front of it only blocks the intended users.
5. The function region comes from `vercel.json` (`fra1`), not the dashboard — see Phase B.
6. 🔑 Note the production alias. Vercel assigns a short one (here:
   `https://smart-lists-jade.vercel.app`) plus `…-<team-slug>.vercel.app`. Use the short one
   everywhere; Phase D needs it.

Node version: `engines` requires `>= 22`, Vercel's default is Node 24 — nothing to change.

---

## Phase D — Google OAuth for the production domain

The existing OAuth client only knows `localhost:3000`. Google matches redirect URIs exactly — no
wildcards — so the production origin has to be registered explicitly.

1. 🔑 Google Cloud Console → **APIs & Services → Credentials** → the existing OAuth 2.0 client:
   - Authorized JavaScript origin: `https://<project>.vercel.app`
   - Authorized redirect URI: `https://<project>.vercel.app/api/auth/callback/google`

   Keep the `localhost` entries — one client can serve both, and that is the simpler choice for a
   solo project. (Alternative: a separate "Smart Lists — Production" client so prod and dev secrets
   are fully disjoint. More hygiene, more moving parts.)
2. 🔑 **OAuth consent screen**: keep it on *External / Testing* and make sure
   `volkertjaden@gmail.com` is listed under **Test users**. Publishing is unnecessary for a closed
   group and would trigger Google's verification review. Expect the "Google hasn't verified this
   app" interstitial — that is normal in Testing mode, and it acts as a second gate on top of the
   app's own allowlist.
3. Changes to the redirect URI can take a few minutes to propagate.

> If a custom domain is added later, both URIs above must be added for it too, or login breaks on
> the new domain.

---

## Phase E — Production database: schema + the single admin

Run from the devcontainer. The production URL is passed **inline**, never written into `.env` —
`prisma.config.ts` loads `.env` via dotenv, and dotenv does not overwrite variables that are already
set in the shell, so an inline `DATABASE_URL=` wins.

Use the **direct/unpooled** URL for migration commands; DDL through PgBouncer is the one place where
the pooler causes trouble.

1. **Verify what you are pointed at before every destructive command.** Print the host only:

   ```bash
   PROD_URL='postgresql://...ep-XXXX.eu-central-1.aws.neon.tech/...'
   echo "$PROD_URL" | grep -o '@[^/]*'
   ```

   The endpoint id must be the **production** one — not the `dev` endpoint from `.env`, not the
   `test` endpoint from `.env.test`.

2. **Check for schema drift first** — it decides which wipe you need:

   ```bash
   DATABASE_URL="$PROD_URL" npx prisma migrate status
   ```

   This branch reported `Database schema is up to date!`, which is expected: it *was* the branch the
   four migrations were developed against. With no drift there is nothing to rebuild, so the wipe is
   data-only — `TRUNCATE` over the eight core tables, reusing `src/test/reset-db.ts` so the table
   list cannot drift from the one every DB test relies on. That is a much smaller operation than
   dropping and replaying the schema.

   Only if `migrate status` reports drift or missing migrations is `prisma migrate reset --force
   --skip-seed` the right tool — and note that Prisma refuses to run it when it detects an AI agent,
   by design. It is for development databases; against anything named production it needs a human's
   explicit, informed consent. For all later deploys the command is `npx prisma migrate deploy`.

3. **Seed the allowlist:**

   ```bash
   DATABASE_URL="$PROD_URL" npx prisma db seed
   ```

   `prisma/seed.ts` upserts `volkertjaden@gmail.com` into `allowlist_entries` and then tries to set
   `is_admin` on the matching user. **On this first run it updates zero users** — the user row does
   not exist yet, because users are provisioned just-in-time on first successful login. That is
   expected; Phase F closes the loop.

---

## Phase F — First login and admin promotion

1. Open `https://<project>.vercel.app` on the iPhone → sign in with Google as
   `volkertjaden@gmail.com`. The `signIn` callback checks the allowlist row from Phase E and
   provisions the user (`is_admin = false`).
2. Promote by re-running the same idempotent seed:

   ```bash
   DATABASE_URL="$PROD_URL" npx prisma db seed
   ```

   Now `updateMany` finds the row and sets `is_admin = true`.
3. **Sign out and sign in again.** The admin flag rides in the JWT, which is minted at login — the
   session from step 1 still says `is_admin: false` and `/admin` would stay hidden.
4. Verify: `/admin` is reachable, the allowlist shows exactly one entry, and the projects screen is
   empty.

---

## Phase G — iPhone verification

This also closes the two checks Slice 8 had to skip for lack of a device
(`docs/implementation-reviews/slice-8-pwa-polish.md`, items 4 and 13):

- [ ] Safari → Share → **Add to Home Screen**; the icon is the app mark, the name is "Smart Lists".
- [ ] Launched from the home screen it opens **standalone** (no Safari chrome), portrait-locked.
- [ ] Create a project, create a list, add entries, check one off — the whole loop on a phone.
- [ ] Safe areas: nothing hides behind the notch or the home indicator.
- [ ] **Offline:** enable airplane mode and re-launch — the German `/offline` fallback appears and
      "Erneut versuchen" recovers once the connection is back. (The worker is shell-only by design:
      no API caching, no offline mutation queue — that is Phase 2.)
- [ ] The service worker registers at all: it is gated on `NODE_ENV === "production"`, so this is
      the first environment where it is live.
- [ ] `/dev/ui` returns **404** in production.

---

## After the first deploy

- **Deploying** = push to `main`. Vercel builds and promotes automatically.
- **Schema changes** = `npx prisma migrate dev` locally against `dev`, commit the migration, push,
  then run `DATABASE_URL="$PROD_URL" npx prisma migrate deploy` **before or right after** the deploy
  that needs it. This is deliberately not wired into the build command: an automatic migration on
  every build makes a failed deploy able to damage production data.
- **Inviting more people** = `/admin` in the running app (Slice 9). Never the seed script again.
- **Break-glass** (revoke every session immediately): rotate `AUTH_SECRET` in Vercel and redeploy —
  every existing JWT becomes invalid.
- **Rollback**: Vercel → Deployments → an older production deployment → *Promote to Production*.
  Note that a rollback does **not** roll back a database migration.

## Known limitations of this setup

- **Preview deployments cannot log in.** Their URL changes per deployment and Google requires exact
  redirect URIs, so OAuth fails there. Previews are still useful for build checks. Fixing this
  properly means a stable preview domain plus its own OAuth client.
- **No CI.** `npm test` / `npm run lint` are not run on push; a broken test only shows up locally.
  A GitHub Actions workflow would need the `test`-branch `DATABASE_URL` as a repository secret.
- **The `middleware` → `proxy` migration** (Next.js deprecation warning) is still open and carried
  in the meta plan.
