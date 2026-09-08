// Phase 1 of the REWE-receipt backfill: turns extract_receipts.csv into a spreadsheet the
// project owner reviews and corrects by hand before anything touches the database.
//
// WHY a review step exists at all: the CSV comes from an automated PDF-extraction pipeline,
// so article names and categories are noisy (OCR typos, singular/plural drift, occasional
// mojibake, a handful of non-article lines like deposits and discounts). Catalog items are
// meant to be long-lived project memory (MVP design §3.1) — creating them wrong is expensive
// to notice and fix later, so a human cross-checks the derived list BEFORE execute-backfill.ts
// writes anything.
//
// Usage: npx tsx scripts/backfill/generate-catalog-review.ts <path-to-csv> <path-to-output-xlsx>

import ExcelJS from "exceljs";
import { buildCatalogCandidates, findPossibleDuplicates, parseReceiptsCsv } from "./shared";

async function main() {
  const [csvPath, outPath] = process.argv.slice(2);
  if (!csvPath || !outPath) {
    console.error(
      "Usage: npx tsx scripts/backfill/generate-catalog-review.ts <csv-path> <xlsx-out-path>",
    );
    process.exit(1);
  }

  const rows = parseReceiptsCsv(csvPath);
  const { candidates, unassignableRows } = buildCatalogCandidates(rows);
  const duplicateHints = findPossibleDuplicates(candidates);

  const workbook = new ExcelJS.Workbook();

  // --- "Hinweise" sheet: short instructions, read first. ------------------------------------
  const notes = workbook.addWorksheet("Hinweise");
  notes.columns = [{ width: 100 }];
  notes.addRows([
    ['Katalog-Vorschlag zur Pruefung -- Projekt "Einkaufen"'],
    [""],
    ['Jede Zeile im Sheet "Katalog" ist ein Artikel, der als Katalogeintrag angelegt wird.'],
    ["Bitte pruefen und bei Bedarf direkt in den Zellen korrigieren:"],
    ["  - Artikelname: der Anzeigename im Katalog."],
    ["  - Kategorie: Vorschlag basiert auf der haeufigsten Kassenbon-Abteilung."],
    ["  - Einheit: Vorschlag basiert auf der haeufigsten Mengeneinheit (kg/STK/leer)."],
    ['  - Ausschliessen: "JA" laesst die Zeile beim Backfill komplett weg (weder Katalog noch Listen).'],
    [""],
    ["Zwei Zeilen zusammenfuehren: beiden Zeilen denselben Artikelnamen geben - sie werden dann"],
    ['beim Backfill zu einem einzigen Katalogeintrag zusammengefuehrt (z. B. "Erdbeere"/"Erdbeeren").'],
    [""],
    ['Spalte "Moegliches Duplikat" ist nur ein Hinweis (grobe Singular/Plural-Heuristik) - bitte'],
    ['gegenpruefen, sie erkennt z. B. Tippfehler-Varianten wie "Parmaschinken"/"Parmschinken" nicht.'],
    [""],
    ['Spalte "Schluessel" bitte NICHT veraendern oder loeschen - sie verknuepft diese Zeile beim'],
    ["Backfill mit den urspruenglichen Kassenbon-Zeilen."],
    [""],
    [
      `${unassignableRows.length} Kassenbon-Zeile(n) ohne jede Artikelbezeichnung (nur Gewicht) ` +
        "konnten keinem Artikel zugeordnet werden und erscheinen unten nicht — sie werden beim " +
        "Backfill ignoriert.",
    ],
  ]);
  notes.getRow(1).font = { bold: true, size: 14 };
  notes.getRow(1).height = 22;

  // --- "Katalog" sheet: one row per candidate catalog item. ---------------------------------
  const sheet = workbook.addWorksheet("Katalog");
  sheet.columns = [
    { header: "Artikelname", key: "name", width: 32 },
    { header: "Kategorie", key: "category", width: 22 },
    { header: "Einheit", key: "unit", width: 10 },
    { header: "Ausschließen (JA/NEIN)", key: "exclude", width: 20 },
    { header: "Grund für Ausschluss", key: "exclusionReason", width: 28 },
    { header: "Häufigkeit (Zeilen)", key: "occurrences", width: 16 },
    { header: "Anzahl Einkäufe", key: "lists", width: 14 },
    { header: "Kategorie uneinheitlich?", key: "ambiguous", width: 20 },
    { header: "Kategorien im Kassenbon", key: "categoryBreakdown", width: 34 },
    { header: "Mögliches Duplikat", key: "duplicateHint", width: 30 },
    { header: "Rohbezeichnungen (Kassenbon)", key: "rawNames", width: 40 },
    { header: "Schlüssel (nicht ändern)", key: "key", width: 26 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "L1" };

  // Distinct suggested categories, for a soft dropdown (Excel still allows free text — this is
  // a convenience, not a hard constraint, since the "correct" category set isn't fixed in the app).
  const knownCategories = [...new Set(candidates.map((c) => c.suggestedCategory))].sort();

  for (const candidate of candidates) {
    const duplicates = duplicateHints.get(candidate.normalizedKey);
    const row = sheet.addRow({
      name: candidate.suggestedName,
      category: candidate.suggestedCategory,
      unit: candidate.suggestedUnit ?? "",
      exclude: candidate.exclusionReason ? "JA" : "NEIN",
      exclusionReason: candidate.exclusionReason ?? "",
      occurrences: candidate.occurrenceCount,
      lists: candidate.listCount,
      ambiguous: candidate.categoryAmbiguous ? "JA" : "NEIN",
      categoryBreakdown: candidate.categoryBreakdown
        .map((entry) => `${entry.category} (${entry.count}x)`)
        .join("; "),
      duplicateHint: duplicates ? duplicates.join("; ") : "",
      rawNames: candidate.rawProductNames.join("; "),
      key: candidate.normalizedKey,
    });
    if (candidate.exclusionReason) {
      row.eachCell((cell) => {
        cell.font = { color: { argb: "FF999999" }, italic: true };
      });
    } else if (candidate.categoryAmbiguous || duplicates) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
      });
    }
    // Soft dropdown on the category cell: shows a list but does not block free text
    // (showErrorMessage: false), because the app's category field has no fixed vocabulary.
    row.getCell("category").dataValidation = {
      type: "list",
      allowBlank: true,
      showErrorMessage: false,
      formulae: [`"${knownCategories.join(",")}"`],
    };
    row.getCell("exclude").dataValidation = {
      type: "list",
      allowBlank: false,
      showErrorMessage: false,
      formulae: ['"JA,NEIN"'],
    };
  }

  await workbook.xlsx.writeFile(outPath);

  const excludedByDefault = candidates.filter((c) => c.exclusionReason).length;
  const ambiguous = candidates.filter((c) => c.categoryAmbiguous).length;
  console.log(`Katalog-Vorschlag geschrieben: ${outPath}`);
  console.log(`  Kandidaten gesamt: ${candidates.length}`);
  console.log(`  davon standardmäßig ausgeschlossen (Pfand/Rabatt/...): ${excludedByDefault}`);
  console.log(`  davon mit uneinheitlicher Kategorie: ${ambiguous}`);
  console.log(`  Kassenbon-Zeilen ohne Artikelbezeichnung (ignoriert): ${unassignableRows.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
