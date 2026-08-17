import fs from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } from "docx";
import sizeOf from "image-size";

/**
 * Fill a .docx template that contains {tags} (Word template with
 * placeholders like {client_name}, {amount}, {date}) with real data.
 * This is the workhorse for "batch write various Word/email templates":
 * call it once per record and you get one populated document per row.
 */
export function fillWordTemplate(templatePath, data, outPath) {
  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render(data);

  const buffer = doc.getZip().generate({ type: "nodebuffer" });
  fs.writeFileSync(outPath, buffer);
  return outPath;
}

/**
 * Batch-generate documents from one template + an array of data rows.
 * Typical use: raw data extracted from Excel/PDF -> one Word doc or
 * email per row (e.g. per client, per invoice).
 */
export function batchFillWordTemplate(templatePath, rows, outDir, filenameFn) {
  const outputs = [];
  rows.forEach((row, i) => {
    const filename = filenameFn ? filenameFn(row, i) : `document-${i + 1}.docx`;
    const outPath = `${outDir}/${filename}`;
    fillWordTemplate(templatePath, row, outPath);
    outputs.push(outPath);
  });
  return outputs;
}

/**
 * Build a Word document from scratch (no template) — used when Claude
 * has produced a report body as structured text/sections and there's
 * no existing template to clone. Each section can optionally include
 * an imagePath (e.g. a chart rendered by chartService.renderChartImage)
 * — the image is embedded after that section's paragraphs, scaled down
 * to fit the page width if it's wider than that.
 */
export async function buildWordDoc(title, sections, outPath) {
  // sections: [{ heading, paragraphs: [...], imagePath?: string }, ...]
  const MAX_WIDTH_PX = 600; // roughly the printable width at default margins

  const children = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
  ];

  for (const section of sections) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
    for (const p of section.paragraphs) {
      children.push(new Paragraph({ children: [new TextRun(p)] }));
    }

    if (section.imagePath) {
      const imageBuffer = fs.readFileSync(section.imagePath);
      const dimensions = sizeOf(imageBuffer);
      const scale = dimensions.width > MAX_WIDTH_PX ? MAX_WIDTH_PX / dimensions.width : 1;

      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: imageBuffer,
              transformation: {
                width: Math.round(dimensions.width * scale),
                height: Math.round(dimensions.height * scale),
              },
            }),
          ],
        })
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);
  return outPath;
}
