# Die Projektstruktur erklärt (für den Einstieg in TypeScript/JavaScript)

Diese Erklärung geht die Projektstruktur Ordner für Ordner durch – so, als würdest du gerade dein allererstes TypeScript-/JavaScript-Projekt sehen. Wir fangen mit ein paar Grundbegriffen an und gehen dann vom Root-Ordner aus durch die wichtigen Unterordner (`prisma`, `public`, `node_modules`, `src`).

## Erstmal: Was ist hier überhaupt für ein Projekt?

Das ist eine **Next.js-Anwendung** (eine Web-App), geschrieben in **TypeScript**. TypeScript ist im Grunde JavaScript mit zusätzlichen "Typen" – also Angaben wie "diese Variable ist ein Text" oder "diese Funktion gibt eine Zahl zurück". Der Computer prüft diese Angaben, bevor das Programm läuft, und fängt so viele Fehler früh ab.

Ein paar Dateiendungen, die immer wieder vorkommen:

- `.ts` → TypeScript-Datei (reine Logik, kein sichtbares HTML)
- `.tsx` → TypeScript **mit JSX**, d.h. Dateien, die HTML-artige UI-Bausteine (React-Komponenten) enthalten
- `.json` → reine Daten/Konfiguration (Schlüssel-Wert-Listen)
- `.mjs` / `.ts` mit `config` im Namen → Einstellungen für die verschiedenen Werkzeuge

---

## Der Root-Ordner (`/workspaces/smart_lists`)

Stell dir den Root-Ordner wie den Empfangsbereich eines Gebäudes vor: Hier liegen vor allem **Steuerungs- und Konfigurationsdateien**, die sagen, *wie* das Projekt gebaut, getestet und gestartet wird. Der eigentliche "Inhalt" (dein Code) liegt im `src`-Ordner.

### Die wichtigste Datei: `package.json`

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest"
},
```

Das ist das **Herzstück und der Personalausweis** des Projekts. Sie enthält:

- **`scripts`**: kurze Befehle, die du im Terminal tippst. Statt `next dev` lang auszuschreiben, sagst du `npm run dev`, und der Dev-Server startet. `npm test` startet die Tests usw.
- **`dependencies`**: die fremden Bausteine ("Pakete"/"Libraries"), die deine App **zur Laufzeit** braucht – z.B. `next` (das Framework), `react` (die UI-Bibliothek), `@prisma/client` (Datenbankzugriff), `next-auth` (Login).
- **`devDependencies`**: Werkzeuge, die du nur **beim Entwickeln** brauchst, nicht im fertigen Produkt – z.B. `typescript`, `eslint` (Code-Prüfer), `vitest` (Test-Werkzeug).

Die `^` vor Versionsnummern bedeuten "diese Version oder eine kompatible neuere".

### `package-lock.json`

Riesige Datei (~300 KB), die du **nie von Hand bearbeitest**. Während `package.json` sagt "ich will ungefähr Next.js 16", schreibt die Lock-Datei *exakt* fest, welche Version (und welche Versionen aller Unter-Pakete) tatsächlich installiert wurden. Das sorgt dafür, dass dein Kollege und dein Server **exakt dieselben** Pakete bekommen wie du.

### Konfigurationsdateien (die ganzen `*.config.*`)

Jedes Werkzeug hat seine eigene Einstellungsdatei:

| Datei | Wofür |
|---|---|
| `tsconfig.json` | Wie sich der TypeScript-Compiler verhält (siehe unten) |
| `next.config.ts` | Einstellungen für Next.js (aktuell quasi leer/Standard) |
| `eslint.config.mjs` | Regeln für den "Code-Polizisten" ESLint, der Stil-/Fehlerprobleme meldet |
| `vitest.config.ts` | Wie die Tests laufen |
| `prisma.config.ts` | Wo die Datenbank-Definition liegt und wie "geseedet" wird |
| `next-env.d.ts` | Auto-generiert von Next.js, **nicht anfassen** – hilft TypeScript, Next.js zu verstehen |

Ein wichtiges Detail aus `tsconfig.json`:

```json
"paths": {
  "@/*": ["./src/*"]
}
```

Das definiert eine **Abkürzung**: Überall im Code, wo du `@/lib/db` schreibst, ist eigentlich `src/lib/db` gemeint. Das erspart hässliche Pfade wie `../../../lib/db`. Du siehst dieses `@/` in fast jeder Datei.

### `.env`, `.env.test`, `.env.example`

"env" = **Environment Variables** (Umgebungsvariablen). Das sind **Geheimnisse und Einstellungen**, die *nicht* im Code stehen sollen:

- `.env` → deine echten Geheimnisse (Datenbank-Passwort, Google-Login-Schlüssel). Steht in `.gitignore`, wird also **nicht** ins Git geladen.
- `.env.test` → eigene Datenbank-Verbindung für die Tests (damit Tests nicht deine echten Daten kaputt machen).
- `.env.example` → eine **Vorlage ohne echte Werte**, die zeigt, *welche* Variablen man setzen muss. Die darf jeder sehen.

### Markdown-Dokumentation (`.md`)

- `README.md` → die "Startseite" des Projekts (was es ist, wie man es startet).
- `CLAUDE.md` / `AGENTS.md` → Anweisungen speziell für KI-Assistenten, die an diesem Projekt arbeiten (Sprachregeln, Tech-Stack, Build-Reihenfolge).
- `docs/` → ausführliche Spezifikationen, Designs und Implementierungs-Reviews (die "Wahrheit", was das Produkt tun soll).

### Versteckte Ordner (beginnen mit `.`)

- `.git/` → das Gedächtnis der Versionskontrolle Git (alle Änderungen, Historie). **Nie von Hand anfassen.**
- `.gitignore` → Liste von Dateien/Ordnern, die Git **ignorieren** soll (z.B. `node_modules`, `.env`, `.next`).
- `.next/` → von Next.js **automatisch gebaute** Dateien (wird beim Start erzeugt; kann man jederzeit löschen, wird neu generiert).
- `.devcontainer/` → Beschreibung der Entwicklungsumgebung (damit alle in einem identischen Container arbeiten).
- `.claude/`, `.remember/`, `.worktrees/` → Hilfsdateien für die KI-/Tooling-Umgebung. Im `.claude/worktrees/...` liegt sogar eine **Kopie des ganzen Projekts** – das ist ein separater Arbeitszweig ("Worktree") für die Entwicklung von "Slice 2". Den kannst du beim Verstehen der Hauptstruktur ignorieren.

---

## Der `node_modules`-Ordner

Das ist der **größte Ordner** und der, vor dem man am meisten Respekt, aber am wenigsten Angst haben muss.

Hier liegen **alle installierten Fremd-Pakete** – also der heruntergeladene Code von `next`, `react`, `prisma`, `next-auth` und deren *eigenen* hunderten Abhängigkeiten. Wenn du `npm install` ausführst, liest npm die `package.json`, lädt alles herunter und stopft es hier rein.

Wichtige Faustregeln für Anfänger:

- **Du bearbeitest hier nie etwas von Hand.**
- **Er wird nicht ins Git eingecheckt** (steht in `.gitignore`). Deswegen gibt es die Lock-Datei: Aus ihr kann der Ordner jederzeit identisch wiederhergestellt werden.
- Wenn mal etwas komisch ist: `node_modules` löschen + `npm install` neu = oft die Lösung.
- Jeder Unterordner ist ein Paket mit *seiner eigenen* `package.json`. So ist der Inhalt strukturiert.

Ein Detail aus den Projektregeln: Es liegt sogar **Dokumentation in `node_modules/next/dist/docs/`** – die App nutzt eine Next.js-Version mit Änderungen, daher soll man dort nachschauen, bevor man Next.js-Code schreibt.

---

## Der `prisma`-Ordner

**Prisma** ist das Werkzeug, mit dem die App mit der **Datenbank** (hier: PostgreSQL bei Neon) redet. Dieser Ordner beschreibt, *wie deine Datenbank-Tabellen aussehen*.

```text
prisma/
├── schema.prisma          ← Definition aller Tabellen
├── seed.ts                ← Füllt Start-Daten ein (z.B. ersten Admin)
└── migrations/
    ├── migration_lock.toml
    └── 20260627130822_init_auth/
        └── migration.sql  ← konkrete SQL-Befehle für diese Änderung
```

### `schema.prisma`

Das ist die **zentrale Beschreibung deiner Datenbank** in Prismas eigener Sprache. Ein Auszug:

```prisma
// A signed-in user. Created on first successful login (JIT provisioning).
model User {
  id          String   @id @default(uuid()) @db.Uuid
  googleSub   String   @unique @map("google_sub")
  email       String
  displayName String?  @map("display_name")
  isAdmin     Boolean  @default(false) @map("is_admin")
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("users")
}
```

Jedes `model` ist eine **Tabelle**. Jede Zeile darin ist eine **Spalte** mit einem Typ (`String`, `Boolean`, `DateTime`). `?` heißt "darf leer sein". `@id` markiert die eindeutige ID. Aktuell gibt es zwei Tabellen: `User` (eingeloggte Nutzer) und `AllowlistEntry` (Liste erlaubter E-Mails – das Projekt hat *keine* offene Registrierung).

Aus dieser Datei **generiert** Prisma automatisch typsicheren Code, mit dem du dann im TypeScript bequem `prisma.user.findMany()` o.Ä. schreiben kannst.

### `migrations/`

Eine Datenbank kann man nicht einfach "überschreiben" – sie enthält ja echte Daten. Stattdessen ändert man sie in kleinen, nummerierten Schritten, **Migrationen** genannt. Jeder Unterordner (z.B. `20260627130822_init_auth`) ist ein solcher Schritt und enthält eine `migration.sql` mit den konkreten Datenbank-Befehlen. Der Zeitstempel im Namen sorgt für die richtige Reihenfolge. So ist die Entwicklung der Datenbank lückenlos nachvollziehbar.

### `seed.ts`

Ein kleines Skript, das **Anfangsdaten** in eine frische Datenbank schreibt – hier z.B. den ersten Admin und seinen Allowlist-Eintrag, damit sich überhaupt jemand einloggen kann.

---

## Der `public`-Ordner

Der einfachste Ordner. Hier liegen **statische Dateien, die unverändert an den Browser ausgeliefert werden** – Bilder, Icons, Logos. Aktuell nur ein paar SVG-Grafiken (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`) aus der Next.js-Vorlage.

Das Besondere: Was hier liegt, ist direkt über die URL erreichbar. `public/next.svg` → `https://deine-seite/next.svg`. Kein Code nötig. Hier kommen später z.B. App-Icons und das Manifest für die PWA rein.

---

## Der `src`-Ordner (hier lebt dein eigentlicher Code)

`src` = "source" (Quellcode). Das ist der **Maschinenraum**. Alles, was *du* schreibst, lebt hier.

```text
src/
├── auth.ts                      ← zentrale Login-Konfiguration
├── middleware.ts                ← "Türsteher" vor jeder Seite
├── app/                         ← die Seiten & API-Routen (Next.js App Router)
├── lib/                         ← wiederverwendbare Logik (kein UI)
├── test/                        ← Test-Hilfsdateien
└── types/                       ← zusätzliche TypeScript-Typen
```

### `src/app/` — die Seiten und Server-Routen

Next.js nutzt den sogenannten **"App Router"**: Hier bestimmt die **Ordnerstruktur die URLs** deiner Webseite. Das ist anfangs ungewohnt, aber elegant.

```text
app/
├── layout.tsx                   ← gemeinsamer Rahmen um ALLE Seiten
├── page.tsx                     ← die Startseite  →  URL "/"
├── globals.css                  ← globale Styles (Aussehen)
├── page.module.css              ← Styles nur für die Startseite
├── login/
│   └── page.tsx                 ← URL "/login"
├── auth/error/
│   └── page.tsx                 ← URL "/auth/error"
└── api/auth/[...nextauth]/
    └── route.ts                 ← Server-Endpunkt unter "/api/auth/*"
```

Die festen Konventionen, die du dir merken solltest:

- **`page.tsx`** = eine sichtbare Seite. Der *Ordnername* wird zur URL. `login/page.tsx` → `/login`.
- **`layout.tsx`** = ein Rahmen, der um die Seiten herumgelegt wird (z.B. `<html>`, Schriftarten, Navigation). Das `{children}` darin ist der Platzhalter, an dem die jeweilige Seite eingesetzt wird.
- **`route.ts`** (statt `page.tsx`) = kein sichtbares HTML, sondern ein **API-Endpunkt** (Server-Funktion, die z.B. JSON liefert). Der Ordner `[...nextauth]` mit den eckigen Klammern ist ein **"catch-all"**: er fängt *alle* Unterpfade von `/api/auth/` ab und reicht sie an die Login-Bibliothek weiter.
- **eckige Klammern** in Ordnernamen = **dynamische Teile** der URL. (Im Slice-2-Worktree gibt es z.B. `projects/[projectId]/page.tsx` → das `[projectId]` ist ein Platzhalter für eine konkrete Projekt-ID in der URL.)
- **`.css`-Dateien** = das Aussehen. `globals.css` gilt überall; `*.module.css` gilt nur für eine bestimmte Komponente.

### `src/lib/` — wiederverwendbare Logik

`lib` = "library". Hier liegt **Logik ohne sichtbares UI** – Dinge, die von mehreren Stellen genutzt werden. Schön thematisch in Unterordner sortiert:

```text
lib/
├── db.ts                        ← Verbindung zur Datenbank (Prisma)
└── auth/                        ← alles rund um Login/Berechtigung
    ├── allowlist.ts             ← prüft, ob eine E-Mail erlaubt ist
    ├── normalize.ts             ← bringt E-Mails in einheitliche Form
    ├── callbacks.ts             ← die Login-Logik (testbar isoliert)
    └── *.test.ts                ← die zugehörigen Tests
```

Ein lehrreiches Beispiel ist `db.ts`:

```ts
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

Das ist das **"Singleton-Muster"**: Es soll nur *eine einzige* Datenbank-Verbindung im ganzen Programm geben (sonst gäbe es beim Entwickeln durch ständiges Neuladen zu viele Verbindungen). `export` bedeutet: andere Dateien dürfen dieses `prisma` per `import { prisma } from "@/lib/db"` benutzen.

Dir fällt auf: Neben jeder Logik-Datei (`allowlist.ts`) liegt eine `allowlist.test.ts`. Das ist gewollt — die **Tests leben direkt neben dem Code**, den sie prüfen.

### `src/auth.ts` — die Login-Zentrale

Diese eine Datei konfiguriert das gesamte Login per Google. Sie sagt: "Nutze Google als Login-Anbieter, speichere die Sitzung als JWT (ein verschlüsseltes Token statt einer Sitzungstabelle), und benutze für die Detail-Logik die Funktionen aus `lib/auth/callbacks`." Sie ist die Brücke zwischen der Bibliothek `next-auth` und deinem eigenen Code.

### `src/middleware.ts` — der Türsteher

**Middleware** läuft *bevor* eine Seite geladen wird – wie ein Türsteher vor jeder Tür. Hier prüft er: "Bist du eingeloggt?" Wenn nicht, wirst du auf `/login` umgeleitet. Der kryptische `matcher` darin ist ein **regulärer Ausdruck**, der festlegt, *welche* URLs geschützt werden – mit Ausnahmen für die Login-Seite selbst, die Auth-API und interne Next.js-Dateien (sonst käme niemand jemals zum Login).

### `src/test/` — Test-Infrastruktur

Hier liegen **keine UI- oder Produktionsdateien**, sondern Helfer, damit die Tests sauber laufen:

- `global-setup.ts` → bereitet die Test-Datenbank *einmal* vor allen Tests vor (migriert sie).
- `setup.ts` → lädt vor jeder Testdatei die `.env.test`.
- `reset-db.ts` → leert die Tabellen zwischen Tests, damit sie sich nicht gegenseitig stören.

### `src/types/` — zusätzliche Typdefinitionen

- `next-auth.d.ts` → eine `.d.ts`-Datei ("declaration"). Sie enthält **keinen ausführbaren Code**, sondern *erweitert* die Typen einer fremden Bibliothek. Konkret sagt sie TypeScript: "Unsere Login-Sitzung enthält zusätzlich eine `userId`, ein `isAdmin` usw." – damit der Compiler diese Felder kennt und prüfen kann.

---

## Wie all das zusammenspielt (der rote Faden)

Wenn du `npm run dev` startest, passiert grob Folgendes:

1. **`package.json`** sagt: führe `next dev` aus.
2. **Next.js** liest `next.config.ts` und `tsconfig.json`, schaut in **`src/app/`** und baut aus der Ordnerstruktur die Webseiten.
3. Ruft jemand eine Seite auf, springt zuerst **`src/middleware.ts`** an (Türsteher) → ggf. Umleitung zu `/login`.
4. Beim Login arbeitet **`src/auth.ts`** zusammen mit **`src/lib/auth/*`** und prüft per **`src/lib/db.ts`** in der **Prisma-Datenbank** (definiert in **`prisma/schema.prisma`**), ob die E-Mail auf der Allowlist steht.
5. Die ganzen Fremdbausteine dafür liegen in **`node_modules`**, Bilder in **`public`**.

Das Projekt ist gerade in einem frühen Stadium ("Slice 1" = Login + Allowlist ist fertig, "Slice 2" = Projekte/Mitgliedschaften wird im `.worktrees`-Bereich gerade gebaut).
