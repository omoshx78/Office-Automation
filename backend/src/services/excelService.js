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
