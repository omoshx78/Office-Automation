import fs from "fs";
import path from "path";
import { simpleParser } from "mailparser";
import { convert as htmlToText } from "html-to-text";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import mammoth from "mammoth";
import * as pdfService from "./pdfService.js";
import * as excelService from "./excelService.js";

/**
 * Parse a .eml file: headers, plain-text body (converted from HTML if
 * no plain-text part exists), and attachments saved to disk. For
 * attachment types we already have readers for (pdf/xlsx), a short
 * text preview is extracted automatically so Claude can reason about
 * "the file attached to this email" without a second tool call.
 */
export async function parseEmlFile(filePath, attachmentsDir) {
  const raw = fs.readFileSync(filePath);
  const parsed = await simpleParser(raw);

  const bodyText =
    parsed.text ||
    (parsed.html ? htmlToText(parsed.html, { wordwrap: false }) : "");

  fs.mkdirSync(attachmentsDir, { recursive: true });

  const attachments = [];
  for (const att of parsed.attachments || []) {
    const safeName = `${Date.now()}-${att.filename || "attachment"}`;
    const outPath = path.join(attachmentsDir, safeName);
    fs.writeFileSync(outPath, att.content);

    const entry = {
      filename: att.filename,
      contentType: att.contentType,
      path: outPath,
      sizeBytes: att.size,
      preview: null,
    };

    try {
      if (att.contentType === "application/pdf") {
        const { text } = await pdfService.extractText(outPath);
        entry.preview = text.slice(0, 1000);
      } else if (
        att.contentType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) {
        const { sheets } = await excelService.loadWorkbook(outPath);
        entry.preview = JSON.stringify(sheets).slice(0, 1000);
      } else if (
        att.contentType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        (att.filename && att.filename.toLowerCase().endsWith(".docx"))
      ) {
        const { value: text } = await mammoth.extractRawText({ path: outPath });
        entry.preview = text.slice(0, 1000);
      }
    } catch (err) {
      entry.preview = `(could not extract preview: ${err.message})`;
    }

    attachments.push(entry);
  }

  return {
    subject: parsed.subject || "",
    from: parsed.from?.text || "",
    to: parsed.to?.text || "",
    date: parsed.date ? parsed.date.toISOString() : null,
    messageId: parsed.messageId || null,
    references: parsed.references || [],
    bodyText,
    attachments,
  };
}

/**
 * Build a reply .eml file from a parsed original email + reply body
 * text. Sets correct Re: subject and In-Reply-To/References headers
 * so the reply threads correctly in any email client it's imported
 * into.
 *
 * IMPORTANT: this function only ever writes a file to disk. There is
 * no SMTP client, no mail API call, and no send() anywhere in this
 * service — intentionally. Every draft is prefixed "DRAFT-" and
 * stamped with a review banner so it's unambiguous, if someone finds
 * the file later, that a human has not yet reviewed or sent it.
 */
export async function buildReplyEml(originalParsed, replyBody, fromAddress, outPath) {
  const subject = originalParsed.subject?.toLowerCase().startsWith("re:")
    ? originalParsed.subject
    : `Re: ${originalParsed.subject || ""}`;

  const bannerText =
    `[DRAFT — NOT SENT. Review before sending.]\n\n` + replyBody;

  const dir = path.dirname(outPath);
  const base = path.basename(outPath);
  const draftOutPath = base.startsWith("DRAFT-") ? outPath : path.join(dir, `DRAFT-${base}`);

  const mail = new MailComposer({
    from: fromAddress,
    to: originalParsed.from,
    subject,
    text: bannerText,
    inReplyTo: originalParsed.messageId || undefined,
    references: originalParsed.messageId
      ? [...(originalParsed.references || []), originalParsed.messageId]
      : originalParsed.references,
  });

  const message = await mail.compile().build();
  fs.writeFileSync(draftOutPath, message);
  return draftOutPath;
}
