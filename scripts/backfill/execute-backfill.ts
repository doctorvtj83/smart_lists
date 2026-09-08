// Phase 2 of the REWE-receipt backfill: writes the reviewed catalog + 19 historic completed
// lists into the "Einkaufen" project.
//
// SAFETY: defaults to a dry run (prints the plan, touches no database) unless --execute is
// passed. Every catalog item is upserted on (projectId, normalizedName) — the same identity
// rule the app itself uses (src/lib/catalog/catalog.ts) — and every list is created only if
// no list with that name already exists in the project, so re-running this script after a
// partial failure is safe: it just skips whatever already landed.
//
// Usage:
//   npx tsx scripts/backfill/execute-backfill.ts <csv-path> <reviewed-xlsx-path>              (dry run)
//   DATABASE_URL="$PROD_URL" npx tsx scripts/backfill/execute-backfill.ts <csv> <xlsx> --execute  (writes)
//
// $PROD_URL is never stored in this repo (see docs/deployment/2026-09-06-production-deploy-runbook.md,
// "Getting $PROD_URL again") — the caller supplies it inline, exactly like the deploy runbook's
// own `prisma migrate deploy` / `prisma db seed` invocations.

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { normalizeName } from "../../src/lib/catalog/normalize";
import { buildCatalogCandidates, parseReceiptsCsv, repairMojibake, resolvePurchaseDate } from "./shared";

const OWNER_EMAIL = "volkertjaden@gmail.com";
const PROJECT_NAME = "Einkaufen";

// One row of the human-reviewed spreadsheet, keyed by the ORIGINAL (pre-review) normalized
// name — the join key generate-catalog-review.ts put in the "Schluessel" column specifically
// so edits to the visible "Artikelname" cell can't break the link back to the raw CSV rows.
interface ReviewedRow {
  finalName: string;
  finalCategory: string | null;
  finalUnit: string | null;
  exclude: boolean;
}

// Reads the "Katalog" sheet back into a lookup by original key. Column order here MUST match
// the `sheet.columns` list in generate-catalog-review.ts — both scripts are the only two
// places this layout is spelled out, so keep them in sync if either changes.
async function readReviewedSheet(xlsxPath: string): Promise<Map<string, ReviewedRow>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const sheet = workbook.getWorksheet("Katalog");
  if (!sheet) throw new Error(`Sheet "Katalog" nicht gefunden in ${xlsxPath}`);

  const result = new Map<string, ReviewedRow>();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header row
    const name = String(row.getCell(1).value ?? "").trim();
    if (!name) return; // a blank row (e.g. trailing sheet padding) — nothing to do
    const category = String(row.getCell(2).value ?? "").trim();
    const unit = String(row.getCell(3).value ?? "").trim();
    const excludeFlag = String(row.getCell(4).value ?? "")
      .trim()
      .toUpperCase();
    const originalKey = String(row.getCell(12).value ?? "").trim();
    if (!originalKey) {
      throw new Error(
        `Zeile ${rowNumber} ("${name}"): Spalte "Schluessel" ist leer — bitte nicht loeschen/ueberschreiben.`,
      );
    }
    result.set(originalKey, {
      finalName: name,
      finalCategory: category || null,
      finalUnit: unit || null,
      exclude: excludeFlag === "JA",
    });
  });
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const [csvPath, xlsxPath] = positional;
  const execute = args.includes("--execute");

  if (!csvPath || !xlsxPath) {
    console.error(
      "Usage: npx tsx scripts/backfill/execute-backfill.ts <csv-path> <reviewed-xlsx-path> [--execute]",
    );
    process.exit(1);
  }

  const reviewed = await readReviewedSheet(xlsxPath);
  const rows = parseReceiptsCsv(csvPath);
  // Re-derive the same candidate grouping phase 1 produced, purely to sanity-check that the
  // reviewed sheet still covers every article the CSV actually has — catches a Schluessel
  // column that got edited/deleted, or a stale xlsx from a different CSV.
  const { candidates } = buildCatalogCandidates(rows);
  const missingFromReview = candidates.filter((c) => !reviewed.has(c.normalizedKey));
  if (missingFromReview.length > 0) {
    throw new Error(
      "Diese Artikel aus der CSV fehlen im geprueften Sheet (Schluessel-Spalte veraendert?): " +
        missingFromReview.map((c) => c.suggestedName).join(", "),
    );
  }

  // Final catalog plan: keyed by the REVIEWED name's normalized form, so two rows the human
  // edited to the same Artikelname (a deliberate merge, e.g. "Erdbeere" + "Erdbeeren" -> both
  // "Erdbeere") collapse into ONE catalog item here — matching the same upsert-on-
  // normalizedName identity the running app uses (src/lib/catalog/catalog.ts).
  interface CatalogPlanItem {
    finalName: string;
    finalCategory: string | null;
    finalUnit: string | null;
  }
  const catalogPlan = new Map<string, CatalogPlanItem>();
  for (const reviewedRow of reviewed.values()) {
    if (reviewedRow.exclude) continue;
    const key = normalizeName(reviewedRow.finalName);
    if (!key) throw new Error(`Leerer Artikelname im Sheet (bei Kategorie "${reviewedRow.finalCategory}").`);
    // If two reviewed rows share this key (a merge), the later one in sheet-row order wins for
    // category/unit — in practice a deliberate merge already has matching values on both rows.
    catalogPlan.set(key, {
      finalName: reviewedRow.finalName,
      finalCategory: reviewedRow.finalCategory,
      finalUnit: reviewedRow.finalUnit,
    });
  }

  // Resolve every raw CSV row to a planned list entry: which date, which (possibly merged)
  // catalog key, and its own quantity/unit exactly as printed on that receipt.
  interface PlannedEntry {
    date: string;
    catalogKey: string;
    quantity: number | null;
    unit: string | null;
  }
  const plannedEntries: PlannedEntry[] = [];
  let excludedRowCount = 0;
  for (const row of rows) {
    if (row.genericName === "null" || row.genericName.trim() === "") continue; // unassignable, reported in phase 1
    const repairedName = repairMojibake(row.genericName).trim();
    const originalKey = normalizeName(repairedName);
    const reviewedRow = reviewed.get(originalKey);
    if (!reviewedRow) {
      // Guarded above by missingFromReview, but keep a loud failure here too rather than a
      // silent skip if the two checks ever drift.
      throw new Error(`Kein Review-Eintrag fuer "${repairedName}" (Schluessel "${originalKey}").`);
    }
    if (reviewedRow.exclude) {
      excludedRowCount++;
      continue;
    }
    plannedEntries.push({
      date: resolvePurchaseDate(row),
      catalogKey: normalizeName(reviewedRow.finalName),
      quantity: row.quantity.trim() !== "" ? Number(row.quantity) : null,
      unit: row.unit.trim() !== "" ? row.unit.trim() : null,
    });
  }

  // Group into one bucket per purchase date == one historic list, keeping each receipt's own
  // row order inside its bucket (sortIndex should read the same as the paper receipt).
  const byDate = new Map<string, PlannedEntry[]>();
  for (const entry of plannedEntries) {
    const bucket = byDate.get(entry.date);
    if (bucket) bucket.push(entry);
    else byDate.set(entry.date, [entry]);
  }
  const dates = [...byDate.keys()].sort();

  console.log(
    `Plan: ${catalogPlan.size} Katalogartikel, ${dates.length} historische Listen, ` +
      `${plannedEntries.length} Eintraege (${excludedRowCount} Kassenbon-Zeilen ausgeschlossen).`,
  );
  for (const date of dates) {
    console.log(`  ${date}: ${byDate.get(date)!.length} Artikel`);
  }

  if (!execute) {
    console.log("\nNur Probelauf (kein --execute) - es wurde NICHTS in die Datenbank geschrieben.");
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL ist nicht gesetzt. Siehe Kommentar am Dateianfang fuer die Aufrufkonvention.");
  }

  const db = new PrismaClient();
  try {
    const project = await db.project.findFirst({
      where: { name: PROJECT_NAME, owner: { email: { equals: OWNER_EMAIL, mode: "insensitive" } } },
    });
    if (!project) {
      throw new Error(`Projekt "${PROJECT_NAME}" fuer ${OWNER_EMAIL} wurde in dieser Datenbank nicht gefunden.`);
    }
    console.log(`Projekt gefunden: ${project.id}`);

    // Pass A: every catalog item, upserted by identity then forced to the reviewed defaults.
    // Two writes (not one upsert) because upsert's `update: {}` deliberately leaves an
    // EXISTING item's defaults untouched (see getOrCreateCatalogItem) — this backfill is the
    // one case that must override them with the just-reviewed values regardless.
    const catalogItemIdByKey = new Map<string, string>();
    for (const [key, plan] of catalogPlan) {
      const item = await db.catalogItem.upsert({
        where: { projectId_normalizedName: { projectId: project.id, normalizedName: key } },
        update: {},
        create: { projectId: project.id, name: plan.finalName, normalizedName: key },
      });
      await db.catalogItem.update({
        where: { id: item.id },
        data: { defaultCategory: plan.finalCategory, defaultUnit: plan.finalUnit },
      });
      catalogItemIdByKey.set(key, item.id);
    }
    console.log(`Katalog: ${catalogItemIdByKey.size} Artikel angelegt/aktualisiert.`);

    // Pass B: one completed list per purchase date. Idempotency guard is the name check, not a
    // deterministic id, so a re-run after a partial failure just skips dates already written.
    let createdLists = 0;
    let skippedLists = 0;
    let createdItems = 0;
    for (const date of dates) {
      const [year, month, day] = date.split("-");
      const listName = `Einkauf ${day}.${month}.${year}`;
      const existing = await db.list.findFirst({ where: { projectId: project.id, name: listName } });
      if (existing) {
        skippedLists++;
        console.log(`  uebersprungen (existiert bereits): ${listName}`);
        continue;
      }

      const list = await db.list.create({
        data: {
          id: randomUUID(),
          projectId: project.id,
          name: listName,
          status: "completed",
          // Historic completedAt (NOT "now"): the suggestion statistic (MVP design §4.3) orders
          // the "last M completed lists" by this field, so it must reflect the real purchase
          // date, not the moment this backfill script ran.
          completedAt: new Date(`${date}T12:00:00Z`),
        },
      });
      createdLists++;

      let sortIndex = 1; // matches the server's own "max+1 starting from 0" convention (operations.ts)
      for (const entry of byDate.get(date)!) {
        const catalogItemId = catalogItemIdByKey.get(entry.catalogKey);
        if (!catalogItemId) {
          throw new Error(`Kein Katalogartikel fuer Schluessel "${entry.catalogKey}" (Liste ${listName}).`);
        }
        await db.listItem.create({
          data: {
            id: randomUUID(),
            listId: list.id,
            catalogItemId,
            quantity: entry.quantity,
            unit: entry.unit,
            category: catalogPlan.get(entry.catalogKey)!.finalCategory,
            checked: true, // historic = already bought
            sortIndex: sortIndex++,
          },
        });
        createdItems++;
      }
    }
    console.log(`Listen: ${createdLists} angelegt, ${skippedLists} uebersprungen (bereits vorhanden).`);
    console.log(`Eintraege: ${createdItems} angelegt.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
