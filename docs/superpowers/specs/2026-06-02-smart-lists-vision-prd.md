# Vision-PRD: Smart Lists

**Stand:** 2026-06-02
**Status:** Vision (Zielbild) — beschreibt die vollständige Produktidee unabhängig vom MVP-Schnitt
**Verwandtes Dokument:** [MVP-Design (Ansatz A)](2026-06-02-smart-lists-mvp-design.md)

---

## 1. Zusammenfassung

Smart Lists ist eine kollaborative Listen-App für einfache Alltagslisten — To-do-, Einkaufs- und Packlisten. Listen werden in **Projekten** organisiert und können mit anderen Nutzern gemeinsam in Echtzeit-Nähe (Synchronisierung im Sekundenbereich) bearbeitet werden. Das herausstechende Merkmal ist die **intelligente Vorbefüllung neuer Listen**: Aus den Favoriten eines Projekts und aus statistischen Mustern vergangener Listen schlägt die App vor, womit eine neue Liste befüllt wird.

Die App läuft als **Progressive Web App (PWA)**, optimiert für die Nutzung auf dem iPhone, und ist langfristig **voll offline-fähig**. Der Zugang ist geschlossen: Es gibt keinen offenen Signup — Nutzer werden von Admins per E-Mail-Allowlist freigeschaltet.

## 2. Problem & Motivation

Wer regelmäßig wiederkehrende Listen führt (der wöchentliche Einkauf, die Packliste fürs Wochenende, Aufgaben für ein gemeinsames Projekt), tippt immer wieder dieselben Einträge neu. Bestehende Listen-Apps sind entweder reine Notizfelder ohne Gedächtnis oder überladene Produktivitäts-Suiten. Es fehlt eine fokussierte App, die:

- das **Wiederkehrende erkennt** und neue Listen sinnvoll vorbefüllt,
- **gemeinsames Bearbeiten** im Haushalt / kleinen Team natürlich macht,
- sich auf dem **Handy** so flüssig anfühlt wie eine native App — auch ohne Empfang.

## 3. Zielgruppe & Zugangsmodell

- **Nutzer:** Mitglieder von Haushalten oder kleinen Gruppen, die wiederkehrende Listen gemeinsam führen.
- **Geschlossener Zugang:** Kein offener Signup. **Admins** laden Personen über deren Google-E-Mail-Adresse auf eine **Allowlist** ein. Nur freigeschaltete E-Mails können sich (per Google-Login) anmelden; alle anderen werden abgewiesen.
- **Authentifizierung:** Über Google-Identität.

## 4. Kernkonzepte

| Konzept | Beschreibung |
|---|---|
| **Projekt** | Thematischer Container (z.B. „Haushalt", „Camping"). Enthält Listen, einen Artikelkatalog und Favoriten. Hat einen Owner und geteilte Mitglieder. |
| **Liste** | Gehört zu einem Projekt. Hat einen Status (aktiv / abgeschlossen). Wird beim Anlegen intelligent vorbefüllt. |
| **Listeneintrag** | Ein Posten auf einer Liste: Artikel + Menge + Einheit + Kategorie + Erledigt-Status. |
| **Artikel (Katalog)** | Pro Projekt geführter, normalisierter Eintrag (Name + Kategorie + Default-Einheit). Das „Gedächtnis" des Projekts und Grundlage für Statistik & Autovervollständigung. |
| **Favorit** | Ein Artikel, der pro Projekt als Favorit markiert ist und neue Listen automatisch vorbefüllt. |
| **Membership / Rolle** | Verbindung Nutzer ↔ Projekt mit Rolle Owner oder Mitglied. |

## 5. Funktionale Anforderungen (Vision)

### 5.1 Projekte & Zusammenarbeit
- Nutzer können Projekte erstellen, umbenennen und löschen.
- Projekte können mit anderen freigeschalteten Nutzern geteilt werden.
- **Rollen:** *Owner* (verwaltet Projekt, lädt Mitglieder ein/entfernt sie, löscht das Projekt) und *Mitglied* (bearbeitet Listen und Einträge voll). Eine reine *Betrachter*-Rolle ist ein mögliches späteres Add-on.
- Alle Inhalte eines geteilten Projekts (Listen, Einträge, Katalog, Favoriten) sind für alle Mitglieder gemeinsam sichtbar und bearbeitbar.

### 5.2 Listen
- Listen erstellen, umbenennen, löschen.
- Einträge hinzufügen, bearbeiten (Name, Menge, Einheit, Kategorie), abhaken, entfernen.
- Einträge nach **Kategorie** gruppieren/sortieren.
- **Abschließen:** Eine Liste kann manuell abgeschlossen werden; zusätzlich schlägt die App das Abschließen automatisch vor, wenn alle Einträge abgehakt sind (mit Undo).
- **Archiv:** Abgeschlossene Listen bleiben im Projekt archiviert, bis sie gelöscht werden. Sie speisen die Vorschlags-Statistik.

### 5.3 Artikelkatalog
- Pro Projekt entsteht automatisch ein Katalog aller je verwendeten Artikel (normalisierter Name + Kategorie + Default-Einheit).
- Beim Tippen eines Eintrags hilft **Autovervollständigung** aus dem Katalog; ein neuer Name legt einen neuen Artikel an.
- Die **Kategorie** wird beim Hinzufügen vom Artikel geerbt, ist am Eintrag überschreibbar und fließt in den Katalog zurück, sodass künftige Listen die Kategorie mit-vorschlagen.

### 5.4 Intelligente Vorbefüllung
Beim Erstellen einer neuen Liste in einem Projekt wird die Liste **vorbefüllt** (Einträge sind direkt entfernbar) aus zwei Quellen:

1. **Favoriten** des Projekts.
2. **Statistische Vorschläge:** Artikel, die in *mindestens N der letzten M abgeschlossenen Listen* des Projekts vorkamen. Default N=2, M=4; pro Projekt konfigurierbar. (Dies verallgemeinert die ursprünglichen Beispiele „alle der letzten 3" und „2 der letzten 4".)

**Vision-Ausbau:** gewichtete Vorschläge (Häufigkeit, Aktualität, Saisonalität, Tageszeit/Wochentag), Lernen aus Annahme/Ablehnung von Vorschlägen, projektübergreifende Muster.

### 5.5 Parallele Bearbeitung & Synchronisierung
- Mehrere Mitglieder können dieselbe Liste gleichzeitig bearbeiten.
- Synchronisierung im Sekundenbereich (Zielbereich 1–3 s) genügt; harte Echtzeit ist nicht erforderlich.
- **Merge auf Eintrags-Ebene:** Änderungen an verschiedenen Einträgen koexistieren; ein Konflikt entsteht nur, wenn dasselbe Feld desselben Eintrags gleichzeitig geändert wird. Jeder Eintrag hat eine stabile, client-generierte ID.

### 5.6 Offline-Fähigkeit (Vision-Zielbild)
Die App soll voll offline nutzbar sein:
- Zuletzt geöffnete Projekte/Listen sind ohne Verbindung sichtbar.
- Bearbeitungen offline möglich; sie werden lokal als Operationen vorgehalten.
- Bei Wiederverbindung werden lokale Operationen synchronisiert und mit fremden Änderungen auf Eintrags-Ebene zusammengeführt.

### 5.7 Administration
- Admins verwalten die Allowlist (E-Mails hinzufügen/entfernen).
- (Vision-Ausbau:) Überblick über Nutzer und Projekte, Deaktivieren von Zugängen.

## 6. Nicht-funktionale Anforderungen

- **Plattform:** Installierbare PWA, UX optimiert für iPhone (Touch, Home-Screen, sichere Bereiche, schnelle Interaktion).
- **Performance:** Sync-Latenz im Bereich 1–3 s; flüssiges Abhaken auch bei schlechtem Empfang (Vision: offline).
- **Sicherheit:** Geschlossener Zugang; jede Operation prüft Mitgliedschaft/Rolle.
- **Datenintegrität:** Eintragsbasierte, idempotente Operationen mit stabilen IDs als Grundlage für verlustfreies Mergen.

## 7. Nicht-Ziele

- Kein offener, selbstbedienter Signup.
- Keine harte Echtzeit-Kollaboration (sub-sekündliche Cursor-Sync etc.).
- Keine komplexen Produktivitäts-Features (Fälligkeiten mit Erinnerungen, Unteraufgaben-Bäume, Zeiterfassung) — Fokus bleibt auf einfachen Listen.
- Keine native iOS-App (PWA genügt).

## 8. Phasen-Ausblick

- **Phase 1 (MVP, Ansatz A):** Geschlossener Zugang, Projekte + Rollen, Listen mit Kategorien, Artikelkatalog, Favoriten + eine Statistik-Regel zur Vorbefüllung, eintragsbasiertes Sync per Polling (nur online), Archiv. Siehe [MVP-Design](2026-06-02-smart-lists-mvp-design.md).
- **Phase 2:** Echte Offline-Fähigkeit (lokaler Speicher, Sync-Queue, Reconnect-Merge).
- **Phase 3:** Smartere Vorschläge (Gewichtung/Lernen), optionale Betrachter-Rolle, Benachrichtigungen, Admin-Übersicht.

## 9. Offene Fragen (Vision)

- Wie weit soll das Lernen aus Annahme/Ablehnung von Vorschlägen gehen (reine Statistik vs. ML)?
- Sollen Einheiten projektweit standardisiert werden (z.B. „L" vs. „Liter")?
- Brauchen abgeschlossene Listen eine zeitliche Auto-Archivierung/Bereinigung?
