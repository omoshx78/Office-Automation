import fs from "fs";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";

/**
 * Merge multiple PDFs into one, in the given order.
 */
export async function mergePdfs(filePaths, outPath) {
  const merged = await PDFDocument.create();
  for (const filePath of filePaths) {
    const bytes = fs.readFileSync(filePath);
    const src = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  fs.writeFileSync(outPath, await merged.save());
  return outPath;
}

/**
 * Split a PDF into separate files by page ranges.
 * ranges: [{ from: 1, to: 3 }, { from: 4, to: 4 }] (1-indexed, inclusive)
 * Returns the list of output file paths written.
 */
export async function splitPdf(filePath, ranges, outDir, baseName = "split") {
  const bytes = fs.readFileSync(filePath);
  const src = await PDFDocument.load(bytes);
  const outputs = [];

  for (let i = 0; i < ranges.length; i++) {
    const { from, to } = ranges[i];
    const out = await PDFDocument.create();
    const indices = [];
    for (let p = from; p <= to; p++) indices.push(p - 1);
    const pages = await out.copyPages(src, indices);
    pages.forEach((p) => out.addPage(p));

    const outPath = `${outDir}/${baseName}-${i + 1}.pdf`;
    fs.writeFileSync(outPath, await out.save());
    outputs.push(outPath);
  }

  return outputs;
}

/**
 * Delete one or more pages (1-indexed) from a PDF.
 */
export async function deletePages(filePath, pagesToRemove, outPath) {
  const bytes = fs.readFileSync(filePath);
  const doc = await PDFDocument.load(bytes);
  // Remove from highest index to lowest so earlier removals don't
  // shift the indices of pages still queued for removal.
  const sorted = [...pagesToRemove].sort((a, b) => b - a);
  for (const pageNum of sorted) {
    doc.removePage(pageNum - 1);
  }
  fs.writeFileSync(outPath, await doc.save());
  return outPath;
}

/**
 * Reorder pages into a new arrangement.
 * newOrder: 1-indexed page numbers from the original doc, in the
 * desired final order, e.g. [3, 1, 2] to reverse-shuffle a 3-page doc.
 */
export async function reorderPages(filePath, newOrder, outPath) {
  const bytes = fs.readFileSync(filePath);
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const indices = newOrder.map((n) => n - 1);
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  fs.writeFileSync(outPath, await out.save());
  return outPath;
}

/**
 * Rotate specific pages (1-indexed) by a given angle (degrees, usually
 * 90/180/270). Pass pageNumbers = null to rotate every page.
 */
export async function rotatePages(filePath, pageNumbers, angleDegrees, outPath) {
  const bytes = fs.readFileSync(filePath);
  const doc = await PDFDocument.load(bytes);
  const targets = pageNumbers ?? doc.getPages().map((_, i) => i + 1);
  for (const pageNum of targets) {
    const page = doc.getPage(pageNum - 1);
    const current = page.getRotation().angle;
    page.setRotation(degrees(current + angleDegrees));
  }
  fs.writeFileSync(outPath, await doc.save());
  return outPath;
}

/**
 * Stamp a diagonal text watermark across every page.
 */
export async function addWatermark(filePath, text, outPath, options = {}) {
  const { opacity = 0.3, fontSize = 48, color = [0.6, 0.6, 0.6] } = options;
  const bytes = fs.readFileSync(filePath);
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(text, {
      x: width / 2 - (text.length * fontSize) / 4,
      y: height / 2,
      size: fontSize,
      font,
      color: rgb(color[0], color[1], color[2]),
      opacity,
      rotate: degrees(45),
    });
  }

  fs.writeFileSync(outPath, await doc.save());
  return outPath;
}

/**
 * Add "Page X of N" page numbers to the bottom-center of every page.
 */
export async function addPageNumbers(filePath, outPath) {
  const bytes = fs.readFileSync(filePath);
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const text = `Page ${i + 1} of ${pages.length}`;
    page.drawText(text, {
      x: width / 2 - (text.length * 9) / 4,
      y: 24,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  });

  fs.writeFileSync(outPath, await doc.save());
  return outPath;
}

/**
 * Fill an existing PDF's AcroForm fields (text fields, checkboxes) by
 * name and flatten the form so values are baked into the page content.
 * fieldValues: { "full_name": "Jane Doe", "agree": true, ... }
 */
export async function fillForm(filePath, fieldValues, outPath, flatten = true) {
  const bytes = fs.readFileSync(filePath);
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();

  for (const [name, value] of Object.entries(fieldValues)) {
    const field = form.getFieldMaybe(name);
    if (!field) continue;
    if (typeof value === "boolean") {
      value ? field.check?.() : field.uncheck?.();
    } else {
      field.setText?.(String(value));
    }
  }

  if (flatten) form.flatten();
  fs.writeFileSync(outPath, await doc.save());
  return outPath;
}

/**
 * List an existing PDF's fillable form field names/types — useful for
 * Claude to check what's available before calling fillForm().
 */
export async function listFormFields(filePath) {
  const bytes = fs.readFileSync(filePath);
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  return form.getFields().map((f) => ({ name: f.getName(), type: f.constructor.name }));
}
