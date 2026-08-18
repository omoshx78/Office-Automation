import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import * as excelService from "./excelService.js";
import * as wordService from "./wordService.js";
import * as pdfService from "./pdfService.js";
import * as pdfEditService from "./pdfEditService.js";
import * as emailService from "./emailService.js";
import * as chartService from "./chartService.js";
import * as pptxService from "./pptxService.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Tool definitions Claude can choose to call. Keep each tool narrow and
// deterministic — Claude decides WHICH to call and in WHAT order and
// WHAT arguments to pass (e.g. "which two files", "what column"); the
// actual file manipulation always happens in the service modules below,
// never inside the model.
const tools = [
  {
    name: "read_excel",
    description: "Read an Excel file and return its sheet names and cell data.",
    input_schema: {
      type: "object",
      properties: { filePath: { type: "string" } },
      required: ["filePath"],
    },
  },
  {
    name: "compute_excel_formulas",
    description:
      "Compute formulas in a sheet (VLOOKUP, INDEX/MATCH, SUM, etc.) and return calculated values.",
    input_schema: {
      type: "object",
      properties: {
        sheets: {
          type: "object",
          description: "Map of sheetName -> 2D array of cell values/formulas",
        },
      },
      required: ["sheets"],
    },
  },
  {
    name: "diff_excel_sheets",
    description:
      "Compare two sheets (2D arrays) cell by cell, by RAW POSITION (row/col index) — breaks if " +
      "rows/columns are reordered between the two files. Prefer reconcile_excel_by_key instead " +
      "whenever a shared key column exists (e.g. an ID); it matches rows by value, not position, " +
      "which is what a real comparison usually needs.",
    input_schema: {
      type: "object",
      properties: {
        sheetA: { type: "array" },
        sheetB: { type: "array" },
      },
      required: ["sheetA", "sheetB"],
    },
  },
  {
    name: "reconcile_excel_by_key",
    description:
      "Proper lookup-based comparison between two Excel files: matches rows by a key column's " +
      "VALUE (like VLOOKUP — robust to reordering/inserted rows) and compares fields by HEADER " +
      "NAME (like HLOOKUP — robust to reordered columns), rather than raw cell position. Writes " +
      "a real downloadable multi-sheet Excel report (Summary, Only in A, Only in B, Differences) " +
      "and returns summary counts plus a preview of the first 20 differences. Use this as the " +
      "default way to compare two spreadsheets whenever they share an identifying column.",
    input_schema: {
      type: "object",
      properties: {
        filePathA: { type: "string" },
        sheetNameA: { type: "string", description: "Optional, defaults to the first sheet" },
        filePathB: { type: "string" },
        sheetNameB: { type: "string", description: "Optional, defaults to the first sheet" },
        keyColumn: { type: "string", description: "Header name of the shared identifying column" },
        labelA: { type: "string", description: "Optional display label for file A in the report" },
        labelB: { type: "string", description: "Optional display label for file B in the report" },
        outPath: { type: "string" },
      },
      required: ["filePathA", "filePathB", "keyColumn", "outPath"],
    },
  },
  {
    name: "write_excel",
    description: "Write a 2D array of data/formulas to a new Excel file.",
    input_schema: {
      type: "object",
      properties: {
        sheetsData: { type: "array" },
        outPath: { type: "string" },
        sheetName: { type: "string" },
      },
      required: ["sheetsData", "outPath"],
    },
  },
  {
    name: "fill_excel_template",
    description:
      "Clone an existing Excel file's formatting and overwrite specific cells with new values (used to produce a report that copies another report's layout).",
    input_schema: {
      type: "object",
      properties: {
        templatePath: { type: "string" },
        outPath: { type: "string" },
        cellUpdates: { type: "array" },
      },
      required: ["templatePath", "outPath", "cellUpdates"],
    },
  },
  {
    name: "fill_word_template",
    description: "Fill a Word template's {tags} with data to produce one document.",
    input_schema: {
      type: "object",
      properties: {
        templatePath: { type: "string" },
        data: { type: "object" },
        outPath: { type: "string" },
      },
      required: ["templatePath", "data", "outPath"],
    },
  },
  {
    name: "batch_fill_word_template",
    description: "Fill a Word template once per row of data, producing multiple documents.",
    input_schema: {
      type: "object",
      properties: {
        templatePath: { type: "string" },
        rows: { type: "array" },
        outDir: { type: "string" },
      },
      required: ["templatePath", "rows", "outDir"],
    },
  },
  {
    name: "extract_pdf_text",
    description: "Extract raw text from a PDF file.",
    input_schema: {
      type: "object",
      properties: { filePath: { type: "string" } },
      required: ["filePath"],
    },
  },
  {
    name: "extract_pdf_structured",
    description:
      "Best-effort extraction of tabular rows/columns from a PDF using text spacing. " +
      "Works for simple layouts; prefer extract_pdf_tables for real tables if available.",
    input_schema: {
      type: "object",
      properties: { filePath: { type: "string" } },
      required: ["filePath"],
    },
  },
  {
    name: "extract_pdf_tables",
    description:
      "Extract real tables from a PDF (bordered/ruled or multi-column) via the Python " +
      "extraction microservice — much more reliable than extract_pdf_structured for complex " +
      "layouts. Returns tables per page. Only use if this fails saying the service isn't configured.",
    input_schema: {
      type: "object",
      properties: { filePath: { type: "string" } },
      required: ["filePath"],
    },
  },
  {
    name: "read_eml",
    description:
      "Parse a .eml email file: subject, from/to, date, body text, and a list of attachments " +
      "(saved to disk with a text preview auto-extracted for PDF/Excel attachments where possible).",
    input_schema: {
      type: "object",
      properties: { filePath: { type: "string" } },
      required: ["filePath"],
    },
  },
  {
    name: "create_email_reply",
    description:
      "Build a reply .eml file from a previously-read email (pass the same object read_eml returned) " +
      "and the reply body text you've composed. Sets Re: subject and threading headers. Does not send anything.",
    input_schema: {
      type: "object",
      properties: {
        originalParsed: {
          type: "object",
          description: "The object returned by a prior read_eml call for this email",
        },
        replyBody: { type: "string" },
        fromAddress: { type: "string" },
        outPath: { type: "string" },
      },
      required: ["originalParsed", "replyBody", "fromAddress", "outPath"],
    },
  },
  {
    name: "merge_pdfs",
    description: "Merge multiple PDF files into one, in the given order.",
    input_schema: {
      type: "object",
      properties: {
        filePaths: { type: "array", items: { type: "string" } },
        outPath: { type: "string" },
      },
      required: ["filePaths", "outPath"],
    },
  },
  {
    name: "split_pdf",
    description: "Split a PDF into multiple files by 1-indexed inclusive page ranges.",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        ranges: {
          type: "array",
          items: {
            type: "object",
            properties: { from: { type: "integer" }, to: { type: "integer" } },
          },
        },
        outDir: { type: "string" },
      },
      required: ["filePath", "ranges", "outDir"],
    },
  },
  {
    name: "delete_pdf_pages",
    description: "Remove one or more 1-indexed pages from a PDF.",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        pagesToRemove: { type: "array", items: { type: "integer" } },
        outPath: { type: "string" },
      },
      required: ["filePath", "pagesToRemove", "outPath"],
    },
  },
  {
    name: "reorder_pdf_pages",
    description: "Reorder a PDF's pages. newOrder is a list of 1-indexed original page numbers in the desired final order.",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        newOrder: { type: "array", items: { type: "integer" } },
        outPath: { type: "string" },
      },
      required: ["filePath", "newOrder", "outPath"],
    },
  },
  {
    name: "rotate_pdf_pages",
    description: "Rotate specific pages (1-indexed) or all pages by a given angle in degrees (e.g. 90, 180, 270).",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        pageNumbers: {
          type: "array",
          items: { type: "integer" },
          description: "Omit or pass null to rotate every page",
        },
        angleDegrees: { type: "integer" },
        outPath: { type: "string" },
      },
      required: ["filePath", "angleDegrees", "outPath"],
    },
  },
  {
    name: "add_pdf_watermark",
    description: "Stamp a diagonal text watermark across every page of a PDF.",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        text: { type: "string" },
        outPath: { type: "string" },
      },
      required: ["filePath", "text", "outPath"],
    },
  },
  {
    name: "add_pdf_page_numbers",
    description: "Add 'Page X of N' numbering to the bottom of every page.",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        outPath: { type: "string" },
      },
      required: ["filePath", "outPath"],
    },
  },
  {
    name: "list_pdf_form_fields",
    description: "List a PDF's fillable form field names and types, before filling them in.",
    input_schema: {
      type: "object",
      properties: { filePath: { type: "string" } },
      required: ["filePath"],
    },
  },
  {
    name: "fill_pdf_form",
    description: "Fill an existing PDF's form fields by name (text fields and checkboxes) and flatten the result.",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        fieldValues: { type: "object" },
        outPath: { type: "string" },
      },
      required: ["filePath", "fieldValues", "outPath"],
    },
  },
  {
    name: "render_chart_image",
    description:
      "Render a chart (bar/line/pie/doughnut) to a PNG image from data. Used to embed a static " +
      "chart into a Word doc or Excel sheet — not editable afterward. For an editable chart, use " +
      "create_presentation instead, which builds native PowerPoint charts.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["bar", "line", "pie", "doughnut", "scatter"] },
        title: { type: "string" },
        labels: { type: "array", items: { type: "string" } },
        datasets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              data: { type: "array", items: { type: "number" } },
            },
          },
        },
        outPath: { type: "string" },
      },
      required: ["type", "labels", "datasets", "outPath"],
    },
  },
  {
    name: "build_word_document",
    description:
      "Build a Word document from scratch (title + sections of paragraphs), with an optional " +
      "chart or other image embedded after any section (pass an imagePath from render_chart_image " +
      "or elsewhere). Use when there's no existing template to clone.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              paragraphs: { type: "array", items: { type: "string" } },
              imagePath: { type: "string", description: "Optional. Embedded after this section's text." },
            },
            required: ["heading", "paragraphs"],
          },
        },
        outPath: { type: "string" },
      },
      required: ["title", "sections", "outPath"],
    },
  },
  {
    name: "insert_excel_image",
    description:
      "Embed a PNG image (typically a chart from render_chart_image) into a sheet of an existing " +
      "Excel workbook, anchored at a cell like 'E2'.",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        sheetName: { type: "string" },
        imagePath: { type: "string" },
        outPath: { type: "string" },
        anchorCell: { type: "string", description: "e.g. 'E2'. Defaults to 'A1'." },
      },
      required: ["filePath", "sheetName", "imagePath", "outPath"],
    },
  },
  {
    name: "create_presentation",
    description:
      "Build a PowerPoint (.pptx) deck from a structured spec: title slides, bullet slides, image " +
      "slides, table slides, and chart slides. Charts here are native, editable PowerPoint chart " +
      "objects (better than the static images used in Word/Excel). Supports a custom color theme.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        theme: {
          type: "object",
          properties: {
            colors: {
              type: "array",
              items: { type: "string" },
              description: "6 hex colors without '#', e.g. ['4E79A7', 'F28E2B', ...]",
            },
            fontFace: { type: "string" },
          },
        },
        slides: {
          type: "array",
          items: {
            type: "object",
            description:
              "One of: {type:'title',title,subtitle?}, {type:'bullets',title,bullets}, " +
              "{type:'image',title?,imagePath}, {type:'table',title?,rows} (rows[0]=header), " +
              "{type:'chart',title?,chartType,labels,series:[{name,values}]}",
          },
        },
        outPath: { type: "string" },
      },
      required: ["slides", "outPath"],
    },
  },
];

async function executeTool(name, input, context) {
  switch (name) {
    case "read_excel": {
      const { sheets } = await excelService.loadWorkbook(input.filePath);
      return sheets;
    }
    case "compute_excel_formulas":
      return excelService.computeValues(input.sheets);
    case "diff_excel_sheets":
      return excelService.diffSheets(input.sheetA, input.sheetB);
    case "reconcile_excel_by_key": {
      const { sheets: sheetsA } = await excelService.loadWorkbook(input.filePathA);
      const { sheets: sheetsB } = await excelService.loadWorkbook(input.filePathB);
      const nameA = input.sheetNameA || Object.keys(sheetsA)[0];
      const nameB = input.sheetNameB || Object.keys(sheetsB)[0];
      const result = excelService.reconcileByKey(
        sheetsA[nameA] || [],
        sheetsB[nameB] || [],
        input.keyColumn
      );
      await excelService.writeReconciliationReport(
        result,
        input.labelA || "File A",
        input.labelB || "File B",
        input.outPath
      );
      return {
        keyColumn: result.keyColumn,
        matchedCount: result.matchedCount,
        onlyInACount: result.onlyInA.length,
        onlyInBCount: result.onlyInB.length,
        differenceCount: result.differences.length,
        differencesPreview: result.differences.slice(0, 20),
        reportSavedTo: input.outPath,
      };
    }
    case "write_excel":
      return excelService.writeWorkbook(input.sheetsData, input.outPath, input.sheetName);
    case "fill_excel_template":
      return excelService.fillTemplateWorkbook(input.templatePath, input.outPath, input.cellUpdates);
    case "fill_word_template":
      return wordService.fillWordTemplate(input.templatePath, input.data, input.outPath);
    case "batch_fill_word_template":
      return wordService.batchFillWordTemplate(input.templatePath, input.rows, input.outDir);
    case "extract_pdf_text":
      return pdfService.extractText(input.filePath);
    case "extract_pdf_structured":
      return pdfService.extractStructured(input.filePath);
    case "extract_pdf_tables":
      return pdfService.extractTables(input.filePath);
    case "read_eml": {
      const attachmentsDir = path.join(context.outputDir, "attachments");
      return emailService.parseEmlFile(input.filePath, attachmentsDir);
    }
    case "create_email_reply":
      return emailService.buildReplyEml(
        input.originalParsed,
        input.replyBody,
        input.fromAddress,
        input.outPath
      );
    case "merge_pdfs":
      return pdfEditService.mergePdfs(input.filePaths, input.outPath);
    case "split_pdf":
      return pdfEditService.splitPdf(input.filePath, input.ranges, input.outDir);
    case "delete_pdf_pages":
      return pdfEditService.deletePages(input.filePath, input.pagesToRemove, input.outPath);
    case "reorder_pdf_pages":
      return pdfEditService.reorderPages(input.filePath, input.newOrder, input.outPath);
    case "rotate_pdf_pages":
      return pdfEditService.rotatePages(
        input.filePath,
        input.pageNumbers ?? null,
        input.angleDegrees,
        input.outPath
      );
    case "add_pdf_watermark":
      return pdfEditService.addWatermark(input.filePath, input.text, input.outPath);
    case "add_pdf_page_numbers":
      return pdfEditService.addPageNumbers(input.filePath, input.outPath);
    case "list_pdf_form_fields":
      return pdfEditService.listFormFields(input.filePath);
    case "fill_pdf_form":
      return pdfEditService.fillForm(input.filePath, input.fieldValues, input.outPath);
    case "render_chart_image":
      return chartService.renderChartImage(
        { type: input.type, title: input.title, labels: input.labels, datasets: input.datasets },
        input.outPath
      );
    case "build_word_document":
      return wordService.buildWordDoc(input.title, input.sections, input.outPath);
    case "insert_excel_image":
      return excelService.insertImage(
        input.filePath,
        input.sheetName,
        input.imagePath,
        input.outPath,
        input.anchorCell || "A1"
      );
    case "create_presentation":
      return pptxService.createPresentation(
        { title: input.title, theme: input.theme, slides: input.slides },
        input.outPath
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Run a natural-language command through Claude with tool use.
 * Claude decides which tools to call (possibly several, in sequence)
 * to satisfy the command, we execute each one against the real files,
 * and feed results back until Claude produces a final text answer.
 */
export async function runCommand(userCommand, context = {}) {
  const messages = [
    {
      role: "user",
      content: `${userCommand}\n\nAvailable file paths / context: ${JSON.stringify(context)}`,
    },
  ];

  const MAX_TURNS = 8;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response;
    try {
      response = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system:
          "You are an office automation assistant. You have tools to read/write Excel, " +
          "compare two spreadsheets (prefer reconcile_excel_by_key over diff_excel_sheets whenever " +
          "there's a shared key column — it's far more reliable and produces a real downloadable " +
          "report), " +
          "fill Word templates, extract PDF data (prefer extract_pdf_tables for real tables when " +
          "it's configured; fall back to extract_pdf_structured or extract_pdf_text if it errors " +
          "saying the service isn't set up), and read .eml emails (including their " +
          "attachments) and draft replies. When asked to summarize an email, call read_eml first " +
          "and base the summary on bodyText plus any attachment previews, then write the summary " +
          "as your final text response (no file needed) unless the user asked for a saved summary. " +
          "When asked to draft/create a response to an email, call read_eml first if you haven't " +
          "already, compose the reply text yourself based on the email's content and the user's " +
          "instructions, then call create_email_reply with that exact object and text to produce " +
          "the .eml file. This tool only ever saves a draft file — there is no way to send email " +
          "in this system, by design. Never imply to the user that a reply was sent; always say " +
          "it was saved as a draft for them to review and send themselves. You can also edit PDFs " +
          "directly: merge, split, delete/reorder/rotate pages, add a text watermark, add page " +
          "numbers, and fill/flatten PDF form fields (list_pdf_form_fields first to see what's " +
          "available). PDF editing can't rewrite existing body text in place — that's a structural " +
          "limitation of the format, not a missing feature; say so if asked to do that. " +
          "You can also build PowerPoint decks (create_presentation) with native, editable charts " +
          "and a custom color theme, and add charts to Word/Excel via render_chart_image plus " +
          "build_word_document or insert_excel_image — those are static images, not editable " +
          "afterward, unlike PowerPoint's native charts; mention that distinction if it's relevant " +
          "to what the user asked for. " +
          "Always explain what you did in plain language in your final response.",
        tools,
        messages,
      });
    } catch (err) {
      // Log full detail server-side (Render logs), but never surface a
      // raw API error body to whoever's typing a command — especially
      // in a multi-tenant app, that's internal operational detail, not
      // something a business user should see on their screen.
      console.error("Anthropic API call failed:", err);

      if (err.status === 401) {
        throw new Error(
          "The AI service isn't configured correctly (invalid or missing API key). " +
            "This needs to be fixed by an administrator, not something you can resolve here."
        );
      }
      if (err.status === 400 && /credit balance/i.test(err.message || "")) {
        throw new Error(
          "The organization's AI service has run out of credits. " +
            "This needs to be resolved by an administrator adding funds to the Anthropic account — " +
            "it isn't something you can fix from here."
        );
      }
      if (err.status === 429) {
        throw new Error("The AI service is temporarily rate-limited or over quota. Try again shortly.");
      }
      if (err.status >= 500) {
        throw new Error("The AI service is temporarily unavailable. Try again in a moment.");
      }
      throw new Error("Something went wrong processing that command. Please try again.");
    }

    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      // Claude produced a final answer, no more tools to call
      const text = response.content.find((b) => b.type === "text");
      return { done: true, text: text?.text ?? "" };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults = [];
    for (const block of toolUseBlocks) {
      let result;
      try {
        result = await executeTool(block.name, block.input, context);
      } catch (err) {
        result = { error: err.message };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { done: false, text: "Reached max turns without a final answer." };
}
