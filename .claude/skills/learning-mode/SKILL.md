---
name: learning-mode
description: Add or remove a Learning Mode section in the project's CLAUDE.md. Use when activating step-by-step explanations for junior developers, or removing them with argument "off".
allowed-tools: Read, Edit, Write, Bash
---

# Learning Mode Command

The user invoked this command with arguments: $ARGUMENTS

## What this command does

- **No argument**: adds a Learning Mode section to this project's CLAUDE.md
- **`off`**: removes the Learning Mode section from CLAUDE.md

---

## Step 1: Locate CLAUDE.md

Look for `CLAUDE.md` in the current working directory. If it doesn't exist and the argument is not `off`, create a new empty file there.

---

## Step 2: If argument is `off`

Read CLAUDE.md and find the Learning Mode section. It starts with `# Learning Mode` or `# Lernmodus` and ends at the next top-level `#` heading or the end of the file.

Remove that section along with any surrounding blank lines. Save the file and confirm to the user that Learning Mode has been removed. **Stop here.**

If no Learning Mode section exists, tell the user there's nothing to remove and stop.

---

## Step 3: Activate Learning Mode (no argument)

### Check for existing section

If CLAUDE.md already contains `# Learning Mode` or `# Lernmodus`, tell the user it's already active and ask whether they want to replace it. If yes, remove the old section first. If no, stop.

### Detect language

Read the existing CLAUDE.md content. Determine whether it's primarily **German** or **English** from the headings and body text. Default to English if unclear or empty.

### Append the section

Add a blank line after the last line of content, then append the appropriate block below.

---

### English version

```
# Learning Mode

I am a junior developer who wants to understand the *why* behind code, not just get
things working. Please follow these guidelines:

## Explanations and working style
- Give me more detailed explanations than you would give a senior developer
- Make smaller, incremental changes rather than large modifications at once
- When making code changes, explain each step — not just *what*, but *why* it works
  that way
- When introducing new concepts, provide educational context so I build real
  understanding, not just copy-paste knowledge
- Add inline comments to code you write or modify, explaining what each part does
  (I can remove them later)
- Always remind me to review and verify larger changes before they go in

## Signals for risky changes
- Use clear visual signals like "⚠️ LARGE CHANGE" or "🔴 HIGH RISK MODIFICATION"
  when making larger or riskier changes
- Always pause and wait for my confirmation before implementing significant
  modifications

## Session speed toggle
- If I say "go fast" or something similar, switch to concise mode for the rest of
  this session — skip step-by-step explanations and just implement efficiently
- If I say "back to learning mode" or something similar, return to detailed
  explanations
- This toggle is session-only and does not modify this file
```

---

### German version

```
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
```

---

## Step 4: Confirm to the user

Tell the user:
- Learning Mode has been added to CLAUDE.md in this project
- What will change: detailed step-by-step explanations, inline comments on code, risk warnings, confirmation before big changes
- Session toggles: say "go fast" to skip explanations temporarily, "back to learning mode" to restore them
- How to remove later: `/learning-mode off`
