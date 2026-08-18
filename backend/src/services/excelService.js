import ExcelJS from "exceljs";
import { HyperFormula } from "hyperformula";

/**
 * Load a workbook from disk and return both the ExcelJS workbook
 * (for structure/formatting) and a plain 2D-array snapshot per sheet
 * (for feeding into HyperFormula / diffing / sending to Claude).
 */
export async function loadWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheets = {};
  workbook.eachSheet((sheet) => {
    const rows = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values.slice(1); // ExcelJS rows are 1-indexed
      rows.push(values.map((v) => (v && v.formula ? `=${v.formula}` : v ?? null)));
    });
    sheets[sheet.name] = rows;
  });

  return { workbook, sheets };
}

/**
 * Compute a workbook's formulas (including VLOOKUP/INDEX-MATCH/etc.)
 * using HyperFormula, and return the calculated values per sheet.
 */
export function computeValues(sheetsData) {
  const hf = HyperFormula.buildFromSheets(sheetsData, { licenseKey: "gpl-v3" });
  const result = {};
  for (const sheetName of hf.getSheetNames()) {
    const sheetId = hf.getSheetId(sheetName);
    result[sheetName] = hf.getSheetValues(sheetId);
  }
  hf.destroy();
  return result;
}

/**
 * Cell-by-cell diff between two same-shaped (or overlapping) sheets.
 * Returns a list of { row, col, a, b } for every differing cell.
 */
export function diffSheets(sheetA, sheetB) {
  const diffs = [];
  const maxRows = Math.max(sheetA.length, sheetB.length);
  for (let r = 0; r < maxRows; r++) {
    const rowA = sheetA[r] || [];
    const rowB = sheetB[r] || [];
    const maxCols = Math.max(rowA.length, rowB.length);
    for (let c = 0; c < maxCols; c++) {
      const a = rowA[c] ?? null;
      const b = rowB[c] ?? null;
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        diffs.push({ row: r + 1, col: c + 1, a, b });
      }
    }
  }
  return diffs;
}

/**
 * Proper reconciliation between two sheets, matched by a key column
 * rather than raw cell position — this is what a business comparison
 * actually needs, and what diffSheets() above deliberately isn't:
 * diffSheets compares cell (row, col) to cell (row, col), which breaks
 * the moment a row is inserted, deleted, or reordered in only one of
 * the two files.
 *
 * This instead:
 *   - matches rows across the two sheets by a key column's VALUE, not
 *     its position (the "VLOOKUP" half — find the matching row
 *     wherever it is)
 *   - compares fields by HEADER NAME, not column index (the "HLOOKUP"
 *     half — a column that moved from D to F is still compared
 *     correctly)
 *
 * Returns:
 *   onlyInA:   rows whose key exists in sheet A but not sheet B
 *   onlyInB:   rows whose key exists in sheet B but not sheet A
 *   differences: for keys present in both, every field where the
 *                value differs: { key, field, valueA, valueB }
 *   matchedCount: keys present in both with no field differences
 */
export function reconcileByKey(sheetA, sheetB, keyColumn) {
  const rowsA = sheetToObjects(sheetA);
  const rowsB = sheetToObjects(sheetB);

  if (rowsA.length > 0 && !(keyColumn in rowsA[0])) {
    throw new Error(`Key column "${keyColumn}" not found in sheet A's headers`);
  }
  if (rowsB.length > 0 && !(keyColumn in rowsB[0])) {
    throw new Error(`Key column "${keyColumn}" not found in sheet B's headers`);
  }

  const mapA = new Map(rowsA.map((row) => [String(row[keyColumn]), row]));
  const mapB = new Map(rowsB.map((row) => [String(row[keyColumn]), row]));

  const onlyInA = [];
  const onlyInB = [];
  const differences = [];
  let matchedCount = 0;

  const allFields = new Set([
    ...(rowsA[0] ? Object.keys(rowsA[0]) : []),
    ...(rowsB[0] ? Object.keys(rowsB[0]) : []),
  ]);

  for (const [key, rowA] of mapA) {
    const rowB = mapB.get(key);
    if (!rowB) {
      onlyInA.push(rowA);
      continue;
    }
    let rowHasDiff = false;
    for (const field of allFields) {
      if (field === keyColumn) continue;
      const valueA = rowA[field] ?? "";
      const valueB = rowB[field] ?? "";
      if (String(valueA) !== String(valueB)) {
        differences.push({ key, field, valueA, valueB });
        rowHasDiff = true;
      }
    }
    if (!rowHasDiff) matchedCount++;
  }

  for (const [key, rowB] of mapB) {
    if (!mapA.has(key)) onlyInB.push(rowB);
  }

  return { keyColumn, onlyInA, onlyInB, differences, matchedCount };
}

/**
 * Write a reconcileByKey() result out as a real, multi-sheet Excel
 * report: a Summary sheet with counts, then one sheet each for
 * "Only in A", "Only in B", and "Differences" (key / field / value in
 * A / value in B). This is the downloadable artifact — not a colored
 * grid, an actual file someone can open, filter, and hand to someone
 * else.
 */
export async function writeReconciliationReport(result, labelA, labelB, outPath) {
  const workbook = new ExcelJS.Workbook();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [{ width: 28 }, { width: 16 }];
  summary.addRows([
    ["Comparison summary", ""],
    ["Key column", result.keyColumn],
    ["Sheet A", labelA],
    ["Sheet B", labelB],
    ["Matched rows, no differences", result.matchedCount],
    ["Rows only in A", result.onlyInA.length],
    ["Rows only in B", result.onlyInB.length],
    ["Field-level differences", result.differences.length],
  ]);
  summary.getRow(1).font = { bold: true, size: 13 };
  summary.getColumn(1).font = { bold: true };

  addObjectSheet(workbook, `Only in ${truncateSheetName(labelA)}`, result.onlyInA);
  addObjectSheet(workbook, `Only in ${truncateSheetName(labelB)}`, result.onlyInB);

  const diffSheet = workbook.addWorksheet("Differences");
  diffSheet.columns = [
    { header: result.keyColumn, key: "key", width: 20 },
    { header: "Field", key: "field", width: 24 },
    { header: `Value in ${labelA}`, key: "valueA", width: 28 },
    { header: `Value in ${labelB}`, key: "valueB", width: 28 },
  ];
  diffSheet.getRow(1).font = { bold: true };
  result.differences.forEach((d) => diffSheet.addRow(d));

  await workbook.xlsx.writeFile(outPath);
  return outPath;
}

function addObjectSheet(workbook, sheetName, rows) {
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31)); // Excel sheet name limit
  if (rows.length === 0) {
    sheet.addRow(["(none)"]);
    return;
  }
  const headers = Object.keys(rows[0]);
  sheet.columns = headers.map((h) => ({ header: h, key: h, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));
}

function truncateSheetName(label) {
  return String(label).replace(/[^a-z0-9]/gi, "").slice(0, 10) || "B";
}


/**
 * Write a 2D array of values/formulas into a new workbook and save it.
 * Used for generating a report that copies another report's layout:
 * pass the template's cell styles/merges via `styleFrom` if you want
 * to clone formatting, or just write raw data for a simpler case.
 */
export async function writeWorkbook(sheetsData, outPath, sheetName = "Sheet1") {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheetsData.forEach((row, rIdx) => {
    row.forEach((value, cIdx) => {
      const cell = sheet.getCell(rIdx + 1, cIdx + 1);
      if (typeof value === "string" && value.startsWith("=")) {
        cell.value = { formula: value.slice(1) };
      } else {
        cell.value = value;
      }
    });
  });
  await workbook.xlsx.writeFile(outPath);
  return outPath;
}

/**
 * Convert a sheet (2D array, first row = headers) into an array of
 * plain objects keyed by header — the shape docxtemplater expects for
 * filling {tag} placeholders, one object per row/document.
 */
export function sheetToObjects(sheet) {
  if (!sheet || sheet.length === 0) return [];
  const [headerRow, ...dataRows] = sheet;
  const headers = headerRow.map((h) => String(h ?? "").trim());
  return dataRows
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ""))
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = row[i] ?? "";
      });
      return obj;
    });
}
/**
 * Embed a PNG image (typically a chart rendered by
 * chartService.renderChartImage) into a sheet of an existing workbook,
 * anchored at a given cell (e.g. "E2"). Loads the workbook, adds the
 * image, and saves to outPath — pass the same path as filePath to
 * overwrite, or a new path to keep the original untouched.
 */
export async function insertImage(filePath, sheetName, imagePath, outPath, anchorCell = "A1") {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  let sheet = workbook.getWorksheet(sheetName);
  if (!sheet) sheet = workbook.addWorksheet(sheetName);

  const imageId = workbook.addImage({
    filename: imagePath,
    extension: "png",
  });

  // Rough size in Excel's column/row grid units — good enough default
  // for a chart; the user can resize it in Excel afterward.
  sheet.addImage(imageId, {
    tl: { col: cellColToIndex(anchorCell), row: cellRowToIndex(anchorCell) },
    ext: { width: 500, height: 300 },
  });

  await workbook.xlsx.writeFile(outPath);
  return outPath;
}

function cellColToIndex(cellRef) {
  const match = cellRef.match(/^([A-Z]+)(\d+)$/i);
  const letters = match[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return col - 1; // 0-indexed
}

function cellRowToIndex(cellRef) {
  const match = cellRef.match(/^([A-Z]+)(\d+)$/i);
  return parseInt(match[2], 10) - 1; // 0-indexed
}

/**
 * Clone an existing workbook's structure/formatting and drop new data
 * into it — this is the "copy another report's format" path. Loads the
 * template, overwrites cell values in-place (keeping styles, merges,
 * number formats), and saves to a new file.
 */
export async function fillTemplateWorkbook(templatePath, outPath, cellUpdates) {
  // cellUpdates: [{ sheet: "Sheet1", row: 2, col: 3, value: 123 }, ...]
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  for (const update of cellUpdates) {
    const sheet = workbook.getWorksheet(update.sheet);
    if (!sheet) continue;
    sheet.getCell(update.row, update.col).value = update.value;
  }

  await workbook.xlsx.writeFile(outPath);
  return outPath;
}
