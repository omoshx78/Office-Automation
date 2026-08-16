import fs from "fs";
import pdfParse from "pdf-parse";

// PDF_SERVICE_URL may come from a Render Blueprint's fromService/hostport
// wiring, which gives "host:port" with no scheme (that's the internal
// private-network address, plain HTTP). Normalize so callers can set
// this either way — a full public HTTPS URL (manual setup) or a bare
// host:port (Blueprint-wired) both work.
const RAW_PDF_SERVICE_URL = process.env.PDF_SERVICE_URL;
const PDF_SERVICE_URL = RAW_PDF_SERVICE_URL
  ? RAW_PDF_SERVICE_URL.startsWith("http")
    ? RAW_PDF_SERVICE_URL
    : `http://${RAW_PDF_SERVICE_URL}`
  : undefined;

/**
 * Extract raw text from a PDF. Good enough for narrative documents
 * and simple layouts. For dense tables/forms, this text often loses
 * column alignment — see extractTables() below for real table support.
 */
export async function extractText(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    numPages: data.numpages,
  };
}

/**
 * Real table extraction via the Python microservice (pdfplumber), which
 * handles bordered/ruled tables and multi-column layouts far better
 * than the naive whitespace splitting below. Requires PDF_SERVICE_URL
 * to be set (see pdf-extraction-service/ and its render.yaml). Throws
 * a clear error if the service isn't configured, rather than silently
 * falling back, so a missing deploy doesn't look like an empty PDF.
 */
export async function extractTables(filePath) {
  if (!PDF_SERVICE_URL) {
    throw new Error(
      "PDF_SERVICE_URL is not set — deploy pdf-extraction-service and set the env var to use real table extraction."
    );
  }

  const buffer = fs.readFileSync(filePath);
  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: "application/pdf" }), "document.pdf");

  const res = await fetch(`${PDF_SERVICE_URL}/extract-tables`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`PDF extraction service error (${res.status}): ${detail}`);
  }

  return res.json(); // { pages: [{ page, tables, text }, ...] }
}

/**
 * Best-effort structured extraction: splits text into lines and
 * naively tokenizes by whitespace runs, which works for simple
 * tables with consistent column gaps. Kept as a dependency-free
 * fallback when the Python microservice isn't deployed — prefer
 * extractTables() above when it's available.
 */
export async function extractStructured(filePath) {
  const { text } = await extractText(filePath);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rows = lines.map((line) => line.split(/\s{2,}/).map((cell) => cell.trim()));
  return rows;
}
