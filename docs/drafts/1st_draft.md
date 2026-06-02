## Erste Ideen für die (Einkaufs-) Listen App

Ich möchte mit deiner Hilfe ein Product Revies Dokument für eine Listen-App erstellen, mit deren Hilfe ich einfache Listen wie To Do-listen, Einkaufs- oder Packlisten erstellen, bearbeiten und mit anderen Nutzern teilen kann. 

Hier zunächst mal ein paar wichtige Features / Eigenschaften:
- Die App sollte als Progressive Web App auf dem Iphone laufen. Dafür sollte auch die User Experience optimiert sein.
- Listen sollten parallel editierbar sein. Allerdings reicht es vermutlich, wenn die Synchronisierung im Bereich 1-3 Sekunden stattfindet.
- Listen sollten zu bestimmten Themen / Projekten gehören. Wenn in einem Projekt eine neue Liste erstellt wird, werden Vorschläge gemacht, womit diese Liste befüllt wird, die aus den Einträgen vergangener Listen besteht.
- Die Vorschläge sollten sich aus nutzerdefinierten Favoriten ableiten und außerdem anhand eines einfachen statistischen Algorithmus gemacht werden (Z.b. alle Objekte, die sich auf allen der letzten 3 Listen bzw. auf 2 der 4 letzten Listen aus diesem Projekt befunden werden)
- Die App sollte Authentifizierung beinhalten. Signup ist nicht für jeden Möglich. Stattdessen werden Nutzer von Admins eingeladen.
- Innerhalb der App sollen Nutzer Projekte erstellen können, die sie dann mit anderen Nutzern teilen, um sie gemeinsam zu bearbeiten (und damit auch die Listen im Projekt)
- Abgearbeitete Listen bleiben archiviert innerhalb eines Projekts enthalten, bis sie gelöscht werden.
- Außerdem entsteht innerhalb des Projekts ein Archiv aller je genutzter Listeneinträge.

Hinsichtlich Tech Stack hatte ich an die folgenden Komponenten gedacht. Allerdings sollte der Fokus unseres PRDs zunächst auf der vollständigen Beschreibung der App und ihrer Zielfunktionalitäten liegen - noch nicht auf der Auswahl des Tech Stacks:

- Ein geeignetes Java-Skript Framework für das Frontend
- Hosting des Frontends auf Vercel
- Neon-DB als Backend
- Polling als Technik für die Synchronisierung bei der Parallelbearbeitung von Listen
- Google IDs für die Authentifizierung
