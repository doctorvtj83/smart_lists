# MVP-Design (Ansatz A): Smart Lists

**Stand:** 2026-06-02
**Status:** Design zur Umsetzung — Grundlage für den Implementierungsplan
**Verwandtes Dokument:** [Vision-PRD](2026-06-02-smart-lists-vision-prd.md)

---

## 1. Zweck dieses Dokuments

Dieses Dokument schneidet aus der [Vision](2026-06-02-smart-lists-vision-prd.md) den **Lean MVP** zu (Ansatz A) und beschreibt ihn so konkret, dass darauf ein Implementierungsplan aufgesetzt werden kann. Leitprinzip:

> Baue jetzt das, was **quer durch das Datenmodell schneidet** und sich später nur mit Migration/Umschreiben nachrüsten ließe (Auth, Membership, Artikel-Identität, Sync-Granularität). Lass alles draußen, was **additiv obendrauf** sitzt (echtes Offline, smartere Algorithmen, mehr Rollen).

Das Datenmodell ist von Anfang an auf die Vision-Ziele (voll offline, smarte Vorschläge) ausgelegt, ohne diese im MVP auszuimplementieren.

## 2. MVP-Scope

**Enthalten:**
- Geschlossener Zugang per Google-Login + E-Mail-Allowlist.
- Projekte mit Rollen Owner / Mitglied; Teilen von Projekten.
- Listen mit Einträgen (Name + Menge + Einheit + Kategorie + Erledigt).
- Gruppieren/Sortieren nach Kategorie.
- Artikelkatalog pro Projekt mit Autovervollständigung; Kategorie-Vererbung.
- Favoriten pro Projekt.
- Vorbefüllung neuer Listen aus Favoriten + einer Statistik-Regel.
- Listen abschließen (manuell oder Auto-Vorschlag bei „alles abgehakt"), Archiv.
- Parallele Bearbeitung **online** via eintragsbasierte Operationen + Polling.
- PWA, installierbar, iPhone-optimiert.

**Bewusst NICHT enthalten (Phase 2+):**
- Echtes Offline (lokaler Speicher, Sync-Queue, Reconnect-Merge).
- Gewichtete/lernende Vorschläge.
- Betrachter-Rolle, Benachrichtigungen, Admin-Übersicht jenseits der Allowlist-Pflege.

## 3. Domänenmodell

Technologieneutral beschrieben (konkrete DB/Framework-Wahl im Implementierungsplan). Alle IDs sind **stabil und client-generierbar** (UUID), damit Einträge offline angelegt und später verlustfrei gemergt werden können.

### 3.1 Entitäten

**User**
- `id`, `google_sub` (Google-Identität), `email`, `display_name`
- `is_admin` (bool) — darf die Allowlist pflegen

**AllowlistEntry**
- `id`, `email`, `invited_by` (User), `created_at`
- Login ist nur erlaubt, wenn die Google-E-Mail hier vorhanden ist.

**Project**
- `id`, `name`, `owner_id` (User), `created_at`
- `suggestion_rule_n` (int, Default 2), `suggestion_rule_m` (int, Default 4) — Parameter der Statistik-Regel

**Membership**
- `id`, `project_id`, `user_id`, `role` (`owner` | `member`), `created_at`
- Eindeutig pro (project_id, user_id).

**CatalogItem** (Artikel — pro Projekt)
- `id`, `project_id`, `name` (Anzeigename), `normalized_name`, `default_category`, `default_unit`
- `normalized_name` ist eindeutig pro Projekt (Identitätsschlüssel für Statistik & Autovervollständigung).

**List**
- `id`, `project_id`, `name`, `status` (`active` | `completed`), `created_at`, `completed_at` (nullable)

**ListItem** (Listeneintrag)
- `id` (client-generiert), `list_id`, `catalog_item_id`
- `quantity` (nullable), `unit` (nullable), `category` (beim Anlegen vom Artikel geerbt, überschreibbar)
- `checked` (bool), `created_at`, `updated_at`
- `sort_index` (für manuelle Reihenfolge innerhalb/zwischen Kategorien)

**Favorite**
- `id`, `project_id`, `catalog_item_id`
- Eindeutig pro (project_id, catalog_item_id). Favoriten gehören dem Projekt (geteilt).

### 3.2 Beziehungen (Überblick)
```
User 1—* Membership *—1 Project 1—* List 1—* ListItem *—1 CatalogItem
                         Project 1—* CatalogItem
                         Project 1—* Favorite *—1 CatalogItem
AllowlistEntry: E-Mail-Gate für Login (kein FK auf User nötig)
```

## 4. Schlüssel-Abläufe

### 4.1 Zugang
1. Nutzer meldet sich per Google an.
2. Backend prüft die zurückgegebene E-Mail gegen die **Allowlist**.
3. Treffer → Session wird erstellt; ggf. User-Datensatz beim ersten Login angelegt (Just-in-time-Provisioning).
4. Kein Treffer → Login abgewiesen, klare Meldung („Zugang nicht freigeschaltet").

### 4.2 Projekt teilen
- Owner fügt eine **freigeschaltete** E-Mail als Mitglied hinzu → neue Membership mit `role = member`.
- Nur Owner darf Mitglieder verwalten und das Projekt löschen/umbenennen.
- Jede API-Operation prüft: Ist der Nutzer Mitglied des betroffenen Projekts? Hat er die nötige Rolle?

### 4.3 Neue Liste mit Vorbefüllung
1. Nutzer erstellt Liste im Projekt.
2. System bestimmt die **Vorschlagsmenge**:
   - **Favoriten:** alle `Favorite` des Projekts.
   - **Statistik:** Artikel, die in **≥ N der letzten M abgeschlossenen** Listen des Projekts vorkamen (Default N=2, M=4; aus `Project`).
   - Vereinigung beider Mengen, dedupliziert pro Artikel.
3. Für jeden vorgeschlagenen Artikel wird ein `ListItem` angelegt (Menge/Einheit/Kategorie aus `CatalogItem`-Defaults).
4. Liste wird **vorbefüllt** angezeigt; Nutzer entfernt Ungewolltes per Wisch/Löschen.

### 4.4 Eintrag hinzufügen / bearbeiten
- Tippen löst **Autovervollständigung** aus `CatalogItem` (Match auf `normalized_name`).
- Bekannter Artikel → `ListItem` referenziert ihn; Kategorie/Einheit als Default übernommen.
- Neuer Name → neuer `CatalogItem` (mit normalisiertem Namen) wird angelegt, dann referenziert.
- Ändert der Nutzer die Kategorie/Einheit am Eintrag, wird der `CatalogItem`-Default aktualisiert (Rückfluss in den Katalog), sodass künftige Listen die aktuelle Kategorie vorschlagen.

**Normalisierung (MVP):** Kleinschreibung + Trimmen + Mehrfach-Leerzeichen kollabieren. (Weitere Normalisierung wie Singular/Synonyme ist Phase-2-Erweiterung und ändert das Modell nicht.)

### 4.5 Parallele Bearbeitung (online)
- Jede Änderung ist eine **eintragsbasierte Operation**: `add_item`, `update_item` (Feld+Wert), `check_item`, `remove_item` — jeweils mit der stabilen `ListItem`-ID.
- Der Client sendet Operationen ans Backend und **pollt** (~1–3 s) Änderungen für die offene Liste/das Projekt.
- **Merge auf Eintrags-Ebene:** Operationen an unterschiedlichen Einträgen sind unabhängig. Konflikt nur bei gleichem Feld desselben Eintrags → MVP-Regel **„letzter gewinnt"** (höchster `updated_at` gewinnt).
- Polling-Endpunkt liefert Änderungen seit einem Cursor (z.B. `updated_at`/Versionsmarke), damit der Client effizient nachzieht.

> **Offline-Vorbereitung:** Da alle Mutationen schon als idempotente, ID-tragende Operationen formuliert sind, kann Phase 2 dieselben Operationen lokal in eine Queue schreiben und bei Reconnect abspielen — ohne die API-Verträge zu ändern.

### 4.6 Abschließen & Archiv
- **Manuell:** Aktion „Abschließen" → `status = completed`, `completed_at` gesetzt.
- **Auto-Vorschlag:** Sind alle Einträge `checked`, schlägt die UI das Abschließen vor (mit Undo).
- Abgeschlossene Listen bleiben im Projekt sichtbar (Archiv) und fließen in die Statistik (4.3), bis sie gelöscht werden.

## 5. Architektur-Schichten (technologieneutral)

1. **Client-PWA** — installierbar, iPhone-optimiert; hält den UI-Zustand der offenen Liste, sendet Operationen, pollt Änderungen.
2. **API** — Auth-Guard (Session aus Google-Login + Allowlist) und **Berechtigungsprüfung pro Operation** (Membership/Rolle). Endpunkte für Projekte, Listen, Einträge (Operationen), Katalog/Autovervollständigung, Favoriten, Allowlist, Polling/Änderungs-Cursor.
3. **Persistenz** — Entitäten aus §3; Eindeutigkeits-Constraints (Allowlist-E-Mail, normalized_name pro Projekt, Membership pro User+Projekt).
4. **Vorschlags-Logik** — reine Lesefunktion über Katalog + abgeschlossene Listen (Favoriten ∪ Statistik-Regel).

> Hinweis: Der Vision-Draft nennt als Idee Vercel-Hosting, Neon-DB, ein JS-Frontend-Framework, Polling und Google-Auth. Die konkrete Technologiewahl wird im Implementierungsplan getroffen; dieses Design bleibt bewusst technologieneutral.

## 6. Berechtigungs-Matrix

| Aktion | Owner | Mitglied | Nicht-Mitglied |
|---|---|---|---|
| Listen/Einträge lesen & bearbeiten | ✓ | ✓ | ✗ |
| Liste erstellen/abschließen/löschen | ✓ | ✓ | ✗ |
| Favoriten/Katalog pflegen | ✓ | ✓ | ✗ |
| Projekt umbenennen/löschen | ✓ | ✗ | ✗ |
| Mitglieder einladen/entfernen | ✓ | ✗ | ✗ |
| Allowlist pflegen | nur `is_admin` | — | — |

## 7. Testbarkeits-Schnitte

Jede Einheit ist isoliert testbar:
- **Allowlist-Gate:** E-Mail freigeschaltet/nicht → Login erlaubt/abgewiesen.
- **Berechtigungsprüfung:** Owner/Mitglied/Nicht-Mitglied gegen jede Aktion aus §6.
- **Normalisierung & Katalog-Identität:** Varianten desselben Namens landen auf einem `CatalogItem`.
- **Vorschlags-Logik:** deterministische Eingaben (Favoriten + abgeschlossene Listen) → erwartete Vorschlagsmenge bei gegebenem N/M.
- **Eintrags-Merge:** unabhängige Operationen koexistieren; Feldkonflikt → „letzter gewinnt".
- **Abschluss-Logik:** manuell und Auto-Vorschlag bei vollständig abgehakt.

## 8. Risiken & Annahmen

- **„Letzter gewinnt" bei Feldkonflikten** ist eine bewusste MVP-Vereinfachung; Phase 2 kann verfeinern (z.B. Feld-Versionen). Kein Modell-Umbau nötig, da Operationen schon ID-/Feld-granular sind.
- **Polling-Last:** Intervall 1–3 s pro offener Liste; bei vielen gleichzeitigen Nutzern Cursor-basiertes Delta nutzen, nicht Vollabzug.
- **„Kein Umbau für Offline" ist Absicht, keine Garantie:** Strengere Anforderungen an Operations-Reihenfolge in Phase 2 können dort noch Verfeinerungen erfordern; die großen, vorhersehbaren Sackgassen sind aber vermieden.

## 9. Nächster Schritt

Auf Basis dieses Designs einen **Implementierungsplan** erstellen (Reihenfolge, vertikale Schnitte, Test-First-Strategie). Empfohlene grobe Reihenfolge: Auth+Allowlist → Projekte+Membership → Listen+Einträge (Operationen) → Katalog+Autovervollständigung → Favoriten+Vorschläge → Abschluss/Archiv → Polling/Sync → PWA-Feinschliff.
