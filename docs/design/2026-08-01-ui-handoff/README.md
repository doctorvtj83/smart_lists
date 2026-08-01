# Handoff: Smart Lists UI (Richtung „Tinte")

## Overview
Komplettes UI-Design für **Smart Lists** — die kollaborative Listen-App (Projekte → Listen → Einträge, intelligente Vorbefüllung, geschlossener Zugang). Basis ist der Design-Brief `docs/design/2026-08-01-ui-design-brief.md` im Repo `doctorvtj83/smart_lists`; das Design deckt alle 11 Screens des Briefs ab, inkl. leerer Zustände, Desktop-Layout und einem klickbaren Prototyp des Kernloops.

Zielumgebung: das bestehende **Next.js-App-Router-Projekt** (`src/app/`), aktuell ungestylt. Slices 1–7 + 9 sind gebaut; dieses Design definiert zugleich die Struktur-Umbauten der Slices 10–12 (Projekt-Drawer, Screen-Aufteilung, Inline-Eintragszeile mit Kategorie-Chips).

## About the Design Files
Die Dateien in diesem Bundle sind **Design-Referenzen in HTML** — Prototypen, die Aussehen und Verhalten zeigen, kein Produktionscode. Aufgabe ist es, diese Designs **im bestehenden Next.js/React-Codebase nachzubauen** (CSS Modules sind dort bereits etabliert; alternativ eine im Team abgestimmte Styling-Lösung). HTML nicht direkt übernehmen.

## Fidelity
**High-fidelity.** Farben, Typografie, Abstände und Interaktionen sind final gemeint — pixelgenau nachbauen. Die Prototyp-Logik (State-Struktur) ist Referenz fürs Verhalten, nicht für die Architektur.

## Design Tokens

### Farben
| Token | Wert | Verwendung |
|---|---|---|
| Hintergrund App | `#fcfcfb` | Alle Screens |
| Hintergrund eingefroren | `#f7f7f5` | Abgeschlossene Liste |
| Hintergrund Sidebar/Drawer | `#f3f4f2` | Drawer-Panel, Desktop-Sidebar |
| Text primär | `#232322` | Überschriften, Eintragsnamen |
| Text sekundär | `#5a5a55` | Fließtext, Labels |
| Text tertiär | `#77776f` | Inaktive Chips |
| Text gedämpft | `#a3a39b` | Metadaten, Platzhalter-Labels, Sektionstitel |
| Text Placeholder | `#c2c2ba` | Input-Placeholder, leere Eingabezeile |
| Akzent (Primär) | `#3e63c4` | Buttons, aktive Chips, Checkboxen, Links |
| Akzent dunkel | `#2f4a94` | Text auf Akzent-Tint |
| Akzent-Tint | `#eef2fc` | Info-Banner, Favoriten-Chips, Badges |
| Destruktiv | `#bf4a41` | Löschen, Entziehen, Fehlertexte |
| Destruktiv-Tint | `#fdf3f2` | Gefährliche Option (Revoke) |
| Destruktiv-Text dunkel | `#8a4038` | Text auf Destruktiv-Tint |
| Erfolg | `#6d8a5e` auf `#eef1ea` | „Abgeschlossen am"-Banner |
| Hairline | `#ececea` | Header-/Sektionslinien |
| Hairline schwach | `#f1f1ee` | Zeilentrenner, Suchfeld-BG, neutrale Chips |
| Rahmen Inputs | `#ececea` (1.5px), Fokus `#3e63c4` | Textfelder |
| Rahmen Sekundär-Button | `#dcdcd7` | „Leere Liste" u. ä. |
| Checkbox unchecked | Rand 2px `#c6c6bf` | Kreis 21px |
| Checked in Archiv | `#b8bdb2` | entsättigt |

### Typografie
- **Font:** Figtree (Google Fonts), Gewichte 400/500/600/700/800. Fallback: `system-ui, sans-serif`.
- Screen-Titel: 18px/700 · Desktop-Titel: 21px/800
- Eintragsname: 15.5px/400 (abgehakt: durchgestrichen, `#b3b3ab`)
- Listen-/Zeilentitel: 14.5–15px/600–700
- Chips: 13.5px, aktiv 700, inaktiv 500
- Sektions-Label: 11px/700, `letter-spacing:.09em`, UPPERCASE, `#a3a39b`
- Metadaten: 12–12.5px, `#a3a39b`
- Buttons: 13.5–15px/700
- Sheet-Titel: 17px/800

### Radii & Schatten
- Karten/Zeilen-Cards: 12px · Hero-Karte/Panels: 14px · Inputs/Buttons: 10px · kleine Inputs: 8px · Chips/Toggles/Badges: 99px · Sheets: 20px oben · Drawer-Projektkarte: 12px
- Karten-Schatten: `0 1px 2px rgba(35,35,34,.06)` · Dropdown: `0 8–10px 24–30px rgba(35,35,34,.12–.16)` · Sheet: `0 -8px 32px rgba(35,35,34,.18)` · Hero: `0 4px 14px rgba(62,99,196,.22)`
- Overlay-Dim: `rgba(35,35,34,.3–.35)`

### Abstände
- Screen-Padding horizontal: 16px (Mobil), 36px (Desktop-Content)
- Eintragszeile: `padding:9px 4px`, `gap:12px`, Trenner 1px `#f1f1ee`
- Checkbox: 21px Kreis (Desktop 20px) — Tap-Target durch Zeilenhöhe ≥44px sicherstellen
- Karten-Listen: `gap:10px`

### Dates & Zahlen
Deutsch: `31.12.2026`, Dezimal-Komma („1,5 l").

## Screens / Views

Alle deutschen Labels exakt aus dem Brief übernehmen. Statische Referenz aller Screens: `Smart Lists Optionen.dc.html` (Turns 2–5); interaktive Referenz: `Smart Lists Prototyp.dc.html`.

### 1. Login (`/login`)
Zentriert: Logo (64px, Radius 18px, Akzent-BG, weißes ✓), „Smart Lists" 24px/800, „ANMELDUNG" 13px/600 letterspaced, Erklärsatz („Der Zugang ist geschlossen. Melde dich mit einem freigeschalteten Google-Konto an."), Google-Button (weiß, 1.5px `#dcdcd7`, Radius 12px, offizielles Google-„G"-Logo — im Handoff nur als Farbkreis angedeutet, echtes Asset verwenden).

### 2. Zugang verweigert (`/auth/error`)
Zentriert: Schloss-Glyphe in 56px-Kreis `#f1f1ee`, „Zugang nicht freigeschaltet" 19px/800, Erklärtext, Link „← Zurück zur Anmeldung" in Akzentfarbe. Freundliche Sackgasse, kein Error-Styling.

### 3. Home (`/`)
Sektion „WEITERMACHEN": Karte der zuletzt offenen Liste mit Projekt + „5 von 8 offen" + Fortschrittsbalken (5px, Radius 3px, Akzent auf `#f1f1ee`). Sektion „PROJEKTE": Zeilen-Cards mit Projekt-Avatar (28px, Radius 8px, Initiale). Unten „Verwaltung" (nur Admin) und „Abmelden".

### 4. Projekte (`/projects`)
Zeilen-Cards: Avatar 30px Radius 9px, Name 15px/700, Meta „3 Listen · 4 Mitglieder", OWNER-Badge (10.5px/700, `#2f4a94` auf `#eef2fc`, Pill) beim eigenen Owner-Projekt. Darunter Anlege-Zeile: Input „Projektname" + Akzent-Button „Anlegen". Empty State siehe §Leere Zustände.

### 5. Projekt-Detail (`/projects/[projectId]`) — nur Listen
- Header: ☰, Projektname **inline-editierbar** (Ruhezustand: 1.5px gestrichelte Unterkante `#c6c6bf`; nur Owner — Mitglieder sehen Plain-Text), rechts „Deine Rolle: Owner|Mitglied" 11.5px.
- **Hero-Karte „Vorbefüllte Liste anlegen"** (Akzent-BG, weiß, Subline „Startet mit Favoriten + häufigen Artikeln") — öffnet das Neue-Liste-Sheet. Das ist das Signature-Feature: visuell schwerste Aktion des Screens.
- Sekundär daneben/darunter: Input „Listenname…" + Rahmen-Button „Leere Liste".
- „AKTIVE LISTEN": Karten neueste zuerst, Meta „5 offen".
- Owner-only ganz unten: „Projekt löschen…" 13px/600 destruktiv, mit Bestätigung.

### 6. Archiv (`/projects/[projectId]/archiv`)
Ruhige Zeilen (kein Karten-Look): 20px-Häkchen-Kreis `#e6e9e2`/`#8a8a83`, Titel 14.5px/600 in `#5a5a55`, „Abgeschlossen am 29.07.2026". Neueste zuerst. Fußnote: „Abgeschlossene Listen speisen die Vorschläge für neue Listen."

### 7. Favoriten (`/projects/[projectId]/favoriten`)
Info-Banner (Akzent-Tint): „★ Favoriten landen automatisch in **jeder** vorbefüllten Liste dieses Projekts." Favoriten als Chips (weiß, 1px `#ececea`, Radius 99px, ✕ zum Entfernen). Add-Zeile: Input „Artikelname" mit Katalog-Autocomplete-Dropdown (Treffer + „„X" neu anlegen") + Button „Als Favorit".

### 8. Katalog (`/projects/[projectId]/katalog`)
Header rechts: „124 Artikel". Suchfeld (BG `#f1f1ee`, Radius 10px, ⌕). Darunter Anlege-Zeile „Neuen Artikel anlegen…" + ＋-Button (legt an und öffnet direkt das Bearbeiten-Panel). Dichte Zeilen: Name 14.5px/600 + Subzeile „Standard-Kategorie · Einheit", alphabetisch. Tap öffnet Inline-Bearbeiten-Panel (Karte, Rahmen `#dfe4f2`):
- Felder NAME / STANDARD-KATEGORIE / EINHEIT
- Kollision beim Umbenennen (normalisierter Name): roter Rahmen + „Artikel existiert bereits"
- Löschen nur wenn in 0 Listen verwendet; sonst kein Button und Hinweis „Löschen nicht möglich — wird in 3 Listen verwendet."

### 9. Mitglieder (`/projects/[projectId]/mitglieder`)
Card mit Zeilen: Avatar-Kreis 30px mit Initiale, Name (+ „(du)"), E-Mail, OWNER-Badge beim Owner (nie entfernbar), „Entfernen" (destruktiv, nur Owner-Sicht) bei Nicht-Ownern. Owner-only darunter: „MITGLIED EINLADEN" mit E-Mail-Input + „Einladen" + Hinweis „Nur freigeschaltete E-Mail-Adressen können eingeladen werden." Für Mitglieder komplett read-only (Controls nicht rendern).

### 10. Liste (`/lists/[listId]`) — der Kern-Screen
- **Header:** „←" (zum Projekt, Akzent), Listentitel, „⋮"-Menü (Liste abschließen / Liste löschen).
- **Kategorie-Chips** als Tab-Leiste unter dem Header: horizontale Scroll-Zeile, aktiver Chip 700/Akzent mit 2px Unterstreichung, inaktive 500/`#77776f`. „Alle" zuerst, dann Kategorien alphabetisch, „Ohne Kategorie" immer zuletzt. Chips sind abgeleitet (exakt die Kategorien der Einträge), Reihenfolge stabil; aktiver Chip überlebt das Leerwerden (Empty State statt Rückfall auf „Alle").
- **Einträge:** In „Alle" gruppiert unter UPPERCASE-Sektionslabels; im Filter ohne Label. Zeile: Check-Kreis (größtes Tap-Target) · Name · Menge/Einheit rechts („1,5 l"). Tap auf Zeile (nicht Checkbox) öffnet das Eintrag-Sheet.
- **Swipe-to-delete:** Zeile nach links ziehen legt rote „Löschen"-Fläche frei; Release < −80px löscht, sonst Snap-back (`transform .18s ease-out`).
- **Trailing-Eingabezeile** (immer letzte Zeile, kein Formular): ＋ und Inline-Input. Placeholder „Eintrag hinzufügen" in „Alle", „Neu in „Molkerei"" bei aktivem Chip. Enter legt an und fokussiert die nächste leere Zeile. Autocomplete-Dropdown über der Zeile. Kategorie-Logik: aktiver Chip überschreibt Katalog-Default; in „Alle" Katalog-Default, sonst „Ohne Kategorie". **Neuer, unbekannter Artikel ohne Kategorie → Eintrag-Sheet öffnet sich direkt** zur Kategoriewahl. Mengen-Parsing „1,5 l Milch" / „3 Joghurt": führende Zahl + bekannte Einheit werden in Menge/Einheit gelöst, der Katalog bekommt nur den Artikelnamen.
- **Eintrag-Sheet** (Bottom-Sheet): Felder MENGE (Dezimal-Komma) / EINHEIT / KATEGORIE, darunter **Kategorie-Chips** aller bekannten Kategorien (Tap wählt, aktiver Chip Akzent-gefüllt), Hinweis „Kategorie und Einheit werden als neuer Standard im Katalog gemerkt." (Rückfluss in den Katalog!), „Fertig" (Akzent, volle Breite) + „Eintrag löschen" (destruktiv).
- **Alles-abgehakt-Banner** (Akzent-Tint, slide-in): „Alle Einträge sind abgehakt." + „Abschließen". Bewusst leise, kein Konfetti.
- **Abgeschlossene Liste:** Grün-Banner „✓ Abgeschlossen am 19.07.2026" + „Wieder öffnen"; Einträge entsättigt (Checked-Kreise `#b8bdb2`, Inhalt ~75% Opazität), BG `#f7f7f5`, keine Eingabezeile, keine Chips, kein Abhaken.
- **Live-Sync:** Polling ~2s. **Kein permanenter Indikator.** Bei Remote-Änderung nur ein kurzer Zeilen-Flash (`background #eef2fc → transparent`, 1.4s ease-out). Keine Konflikt-UI (last writer wins, serverseitig).

### 11. Verwaltung (`/admin`) — nur Admins
- Block „ZUGANG": Card mit einer Zeile pro Allowlist-E-Mail: E-Mail (+ „(du)"), Status (Anzeigename oder „Noch nie angemeldet"), „Admin: Ja/Nein", „Admin gewähren/entziehen" (nur nach erstem Login, sonst Hinweis „Admin erst nach dem ersten Login möglich"), „Zugang entziehen" (destruktiv). Eigene Zeile ohne Buttons.
- Block „E-MAIL EINLADEN": Input + Button + Hinweis „Es wird keine Einladungs-E-Mail versendet — sag der Person selbst Bescheid." Duplikat → „E-Mail ist bereits freigeschaltet".
- **Zwei-Wege-Revoke** (Bottom-Sheet, wichtigstes Stück): Titel „Zugang entziehen: <email>", Liste der Projekt-Mitgliedschaften mit Rolle. Zwei klar unterscheidbare Optionen:
  1. „Nur Zugang entziehen" — neutraler Rahmen `#dcdcd7`; Subline „Keine neuen Logins. Mitgliedschaften bleiben — erneutes Einladen stellt alles wieder her."
  2. „Zugang entziehen und aus allen Projekten entfernen" — Rahmen + Text destruktiv auf `#fdf3f2`; Subline „Sofort und endgültig — erneutes Einladen bringt die Mitgliedschaften **nicht** zurück."
  Nie angemeldet → nur Option 1. Owner-Hinweis darunter: „Als Owner von „X" behält … dort in jedem Fall Zugriff." + „Abbrechen". Wording immer „Zugang entziehen", nie „Nutzer entfernen".

## Navigation

### Drawer (Mobil) / Sidebar (Desktop ≥ ~900px)
Gleicher Inhalt: Projektkarte oben (Avatar + Name + ▾) = **Projekt-Switcher** (Dropdown: Projekte mit ✓ beim aktiven, „＋ Neues Projekt…"). Dann: Listen (mit Zähler) / Archiv — Trenner — PROJEKT: Favoriten / Katalog / Mitglieder — unten: Verwaltung (nur Admin) / Abmelden. Aktiver Eintrag: weiße Pille mit Schatten, Akzent-Icon, 700. Icons im Design als 17px-Quadrat-Platzhalter (`#c9cbc5` bzw. Akzent) — durch echtes Icon-Set ersetzen (z. B. Lucide, Stroke ~1.75).
Mobil: Overlay-Drawer 276px, Dim `rgba(35,35,34,.35)`, Slide-in. Desktop: feste Sidebar 250px, Rand `#e7e8e4`, Content max ~620px, Chips als Tab-Zeile (Referenz: Optionen-Datei 4a/4b).

### Kategorie-Chips ≠ Navigation
Chips sind ein Filter direkt über dem Inhalt, nie im Drawer.

## Interactions & Behavior

### Animationen (Referenzwerte aus dem Prototyp)
- Drawer: `translateX(-100%) → 0`, 240ms ease-out; Dim fade 200ms
- Bottom-Sheets: `translateY(46px) + fade → 0`, 280ms `cubic-bezier(.2,.9,.3,1)`
- ⋮-Menü/Toast: fade 150–200ms
- Banner: `translateY(-8px) + fade`, 280ms ease-out
- Check: Scale-Pop `0.55 → 1.18 → 1`, 200ms ease-out
- Remote-Flash: BG `#eef2fc → transparent`, 1.4s ease-out
- Swipe-Snapback: `transform .18s ease-out`

### Inline-Editing (gemeinsames Muster)
Ruhe: Text mit gestrichelter Unterkante (nur wo editierbar). Fokus: Textfeld mit 1.5px Akzent-Rahmen, Radius 10px. Fehler: Rahmen + Meldung in `#bf4a41` direkt unter dem Feld (kurzer deutscher Satz). Speichern via Enter/Blur.

### Destruktive Aktionen (gemeinsames Muster)
Auslöser: 12.5–13px/600 in `#bf4a41`, nie als gefüllter Button in Listenzeilen. Bestätigung: Bottom-Sheet mit Konsequenz-Erklärung; die gefährlichere Option destruktiv gerahmt/gefüllt (siehe Revoke). Owner-/Admin-only-Controls **nicht rendern** statt disablen.

### Empty States (ein Muster)
Zentriert: Glyphe in 52px-Kreis/-Quadrat (Tint-BG), Titel 16px/700, ein Satz 13.5px `#77776f`, direkt darunter die Aktion. Sieben Fälle (Referenz Optionen-Datei 5a–5g): keine Projekte, Projekt ohne Listen, leere Liste (die Eingabezeile selbst + Hinweistext), leerer aktiver Chip („Nichts mehr in „X"" — im Filter bleiben!), keine Favoriten, leerer Katalog („füllt sich von selbst"), leeres Archiv.

### PWA / Mobil
iPhone-first: Safe Areas (`env(safe-area-inset-*)`) oben/unten respektieren, Bottom-Sheets mit extra Bottom-Padding (~30px), Tap-Targets ≥44px, `touch-action:pan-y` auf swipebaren Zeilen. Status bar/Home-Indicator im Prototyp sind nur Rahmen-Deko.

## State Management (Verhaltensreferenz)
- Liste: `activeChip` (überlebt Leerwerden), Einträge stabil sortiert innerhalb der Gruppe; Polling-Merge auf Eintragsebene.
- Vorbefüllung: Favoriten ∪ Artikel in ≥N der letzten M abgeschlossenen Listen (Default 2/4, pro Projekt). Im Sheet: Vorschau-Chips einzeln abwählbar (durchgestrichen + ✕), Button-Label zählt live („Liste mit N Einträgen anlegen"), Toggle „Vorbefüllen" ganz aus.
- Eintrag anlegen: siehe §10 (Chip-Override, Katalog-Default, Sheet-Auto-Open bei neuem Artikel, Mengen-Parsing).
- Katalog-Rückfluss: Kategorie/Einheit-Änderung am Eintrag aktualisiert den CatalogItem-Default.

## Assets
- **Font:** Figtree via Google Fonts (`wght 400–800`) — oder self-hosted.
- **Google-„G"**: offizielles Branding-Asset verwenden (im Design nur angedeutet).
- **Icons:** keine im Design enthalten (bewusst Platzhalter-Quadrate) — Icon-Set im Codebase wählen und konsistent einsetzen.
- Kein weiteres Bildmaterial nötig.

## Files
- `Smart Lists Prototyp.dc.html` — interaktiver Prototyp (maßgeblich für Verhalten & Motion): Login → Liste, Chips, Abhaken, Swipe-Delete, Eintrag-Sheet, Vorbefüllungs-Sheet, Drawer + Projekt-Switcher, Archiv, Favoriten, Katalog, Mitglieder, Verwaltung inkl. Zwei-Wege-Revoke, simulierte Remote-Änderungen (Zeilen-Flash).
- `Smart Lists Optionen.dc.html` — statische Referenz: Turn 2 (Liste offen/gefiltert, Drawer, Vorbefüllung), Turn 3 (alle 11 Screens), Turn 4 (Desktop 4a/4b), Turn 5 (leere Zustände 5a–5g). Turn 1 = verworfene Erkundungen, ignorieren.
- `screenshots/` — 12 nummerierte Screenshots der Kern-Screens aus dem Prototyp (Login, Liste „Alle"/gefiltert, Projekt, Drawer, Favoriten, Katalog, Verwaltung + Revoke-Sheet, Neue-Liste-Sheet, Archiv, Mitglieder). Nur zur schnellen Orientierung — die HTML-Dateien sind die verbindliche Quelle.
- Diese Dateien öffnen direkt im Browser. Die Inline-Styles darin sind die verbindliche Quelle für alle Maße/Farben.
