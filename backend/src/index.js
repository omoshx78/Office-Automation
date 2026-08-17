import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { initDb } from "./db/pool.js";
import * as authService from "./services/authService.js";
import { authenticate, requireAdmin, requireSuperadmin } from "./middleware/authenticate.js";
import { runCommand } from "./services/claudeOrchestrator.js";
import * as excelService from "./services/excelService.js";
import * as wordService from "./services/wordService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");
const OUTPUT_ROOT = path.join(__dirname, "..", "outputs");

const app = express();

// Restrict cross-origin requests to known frontend URL(s) instead of
// allowing any origin. ALLOWED_ORIGINS is a comma-separated list —
// set it to your production Vercel URL, and add any others you need
// (e.g. a custom domain, localhost for local dev). *.vercel.app is
// allowed automatically so Vercel's per-branch preview deployments
// keep working without listing every preview URL by hand.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header (curl, server-to-server, some health checks)
      // — allow it; there's no browser same-origin policy to enforce.
      if (!origin) return callback(null, true);

      const isExplicitlyAllowed = allowedOrigins.includes(origin);
      const isVercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);

      if (isExplicitlyAllowed || isVercelPreview) {
        return callback(null, true);
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
  })
);
app.use(express.json({ limit: "20mb" }));

// Per-user directories. Every authenticated request scopes its file
// I/O to these, so one user can never read or overwrite another's
// files by path or by guessing a URL.
function userUploadDir(userId) {
  const dir = path.join(UPLOAD_ROOT, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function userOutputDir(userId) {
  const dir = path.join(OUTPUT_ROOT, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------- Auth routes (unauthenticated) ----------

// The only self-service entry point: creates a brand new organization
// (tenant) and its first user, who becomes that org's admin. There is
// no general public "sign up" beyond this — everyone else is added by
// an admin via the /api/admin/users routes below.
app.post("/api/auth/register-organization", async (req, res) => {
  try {
    const { orgName, username, password } = req.body;
    const { user, org, token } = await authService.registerOrganization(orgName, username, password);
    res.status(201).json({ user, org, token });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const { user, token } = await authService.login(username, password);
    res.json({ user, token });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.get("/api/auth/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

// ---------- Admin-only user management (scoped to the admin's own org) ----------

app.get("/api/admin/users", authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await authService.adminListUsers(req.user.orgId);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/users", authenticate, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const user = await authService.adminCreateUser(req.user.orgId, username, password, role);
    res.status(201).json({ user });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.delete("/api/admin/users/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await authService.adminDeleteUser(req.user.orgId, req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post("/api/admin/users/:id/reset-password", authenticate, requireAdmin, async (req, res) => {
  try {
    await authService.adminResetPassword(req.user.orgId, req.params.id, req.body.newPassword);
    res.status(204).end();
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ---------- Platform superadmin only (break-glass, not org data access) ----------

app.get("/api/superadmin/organizations", authenticate, requireSuperadmin, async (req, res) => {
  try {
    const organizations = await authService.platformListOrganizationsWithAdmins();
    res.json({ organizations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  "/api/superadmin/users/:id/reset-password",
  authenticate,
  requireSuperadmin,
  async (req, res) => {
    try {
      await authService.platformResetPassword(req.params.id, req.body.newPassword);
      res.status(204).end();
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  }
);

// ---------- Everything below requires a valid token ----------

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, userUploadDir(req.user.id)),
    filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
  }),
});

app.post("/api/upload", authenticate, upload.array("files"), (req, res) => {
  const files = req.files.map((f) => ({
    originalName: f.originalname,
    path: f.path,
  }));
  res.json({ files });
});

// Authenticated file download for anything a request produced in this
// user's output directory. Replaces a blanket express.static mount,
// which would otherwise let anyone with a guessed URL fetch anyone
// else's output file. Path is resolved and checked to stay within the
// user's own directory before serving.
app.get("/api/outputs/:filename", authenticate, (req, res) => {
  const dir = userOutputDir(req.user.id);
  const requested = path.join(dir, req.params.filename);
  if (!requested.startsWith(dir + path.sep) && requested !== dir) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  if (!fs.existsSync(requested)) {
    return res.status(404).json({ error: "Not found" });
  }
  res.sendFile(requested);
});

app.post("/api/compare-excel", authenticate, async (req, res) => {
  const { filePathA, sheetNameA, filePathB, sheetNameB } = req.body;
  if (!filePathA || !filePathB) {
    return res.status(400).json({ error: "filePathA and filePathB are required" });
  }

  try {
    const { sheets: sheetsA } = await excelService.loadWorkbook(filePathA);
    const { sheets: sheetsB } = await excelService.loadWorkbook(filePathB);

    const nameA = sheetNameA || Object.keys(sheetsA)[0];
    const nameB = sheetNameB || Object.keys(sheetsB)[0];
    const sheetA = sheetsA[nameA] || [];
    const sheetB = sheetsB[nameB] || [];

    const diffs = excelService.diffSheets(sheetA, sheetB);

    res.json({
      sheetNameA: nameA,
      sheetNameB: nameB,
      sheetA,
      sheetB,
      diffs,
      availableSheetsA: Object.keys(sheetsA),
      availableSheetsB: Object.keys(sheetsB),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/batch-generate", authenticate, async (req, res) => {
  const { templatePath, dataFilePath, sheetName, filenameField } = req.body;
  if (!templatePath || !dataFilePath) {
    return res.status(400).json({ error: "templatePath and dataFilePath are required" });
  }

  try {
    const { sheets } = await excelService.loadWorkbook(dataFilePath);
    const sheet = sheetName ? sheets[sheetName] : Object.values(sheets)[0];
    if (!sheet) return res.status(400).json({ error: "Sheet not found in data file" });

    const rows = excelService.sheetToObjects(sheet);
    if (rows.length === 0) {
      return res.status(400).json({ error: "No data rows found in sheet" });
    }

    const outDir = userOutputDir(req.user.id);
    const batchId = uuidv4();
    const batchDir = path.join(outDir, `batch-${batchId}`);
    fs.mkdirSync(batchDir, { recursive: true });

    const outputs = wordService.batchFillWordTemplate(templatePath, rows, batchDir, (row, i) => {
      const base = filenameField && row[filenameField] ? String(row[filenameField]) : `document-${i + 1}`;
      return `${base.replace(/[^a-z0-9_\-]/gi, "_")}.docx`;
    });

    const zipName = `batch-${batchId}.zip`;
    const zipPath = path.join(outDir, zipName);
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip");
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);
      outputs.forEach((filePath) => archive.file(filePath, { name: path.basename(filePath) }));
      archive.finalize();
    });

    res.json({
      count: outputs.length,
      files: outputs.map((p) => path.basename(p)),
      zipUrl: `/api/outputs/${zipName}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/command", authenticate, async (req, res) => {
  const { command, context } = req.body;
  if (!command) return res.status(400).json({ error: "command is required" });

  try {
    const result = await runCommand(command, { ...context, outputDir: userOutputDir(req.user.id) });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;

initDb()
  .then(async () => {
    // A misconfigured SUPERADMIN_USERNAME/PASSWORD (bad format, too
    // short, etc.) is a validation problem with that one optional
    // feature — it must never take down the whole app and lock every
    // organization out. Log it clearly and keep starting up; only a
    // genuine database/connection failure below is fatal.
    try {
      await authService.ensureSuperadminFromEnv();
    } catch (err) {
      console.error(
        "Superadmin bootstrap skipped due to a configuration error " +
          "(app is starting normally without it):",
        err.message
      );
    }
  })
  .then(() => {
    app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
