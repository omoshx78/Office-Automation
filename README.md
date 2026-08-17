# Office Automation App — starter scaffold

React (Vercel) + Node/Express (Render) + Claude API as the orchestrator.

## How it works

1. User uploads files (Excel/Word/PDF) through the React UI.
2. User types a plain-language command ("compare these two sheets and
   list what changed", "fill the invoice template with this data", "pull
   the table out of this PDF").
3. The backend sends the command to Claude with a set of **tools** (see
   `backend/src/services/claudeOrchestrator.js`). Claude decides which
   tool(s) to call and with what arguments.
4. Each tool call runs real, deterministic code — never the model —
   against the actual files: `excelService.js`, `wordService.js`,
   `pdfService.js`.
5. Results (computed values, diffs, generated files) go back to Claude,
   which can chain further tool calls, then produces a final plain-
   English explanation returned to the UI.

## Multi-tenant accounts (organization / admin model)

Accounts are organized around **tenants (organizations)**, not flat
individual signups:

- `POST /api/auth/register-organization` — the *only* self-service
  entry point. Creates a brand new organization and its first user,
  who becomes that org's **admin**. This is how a company/team first
  onboards.
- `POST /api/auth/login` — username + password (no email involved).
  Usernames are unique platform-wide, so login doesn't need an
  "organization" selector.
- **Everyone else is added by an admin**, not by public signup:
  - `POST /api/admin/users` — admin creates a user in their own org
    with a username, an initial password, and a role (`member` or
    `admin`). The admin hands these credentials to the person directly.
  - `GET /api/admin/users` — list an org's users.
  - `DELETE /api/admin/users/:id` — remove a user (refuses to remove
    the org's last remaining admin, so an org can never be locked out).
  - `POST /api/admin/users/:id/reset-password` — admin resets a
    forgotten password directly. This is the account-recovery path
    that replaces "email me a reset link" — there's no email here.
- All of the above (except registration/login) require
  `Authorization: Bearer <token>` **and** the `admin` role
  (`authenticate` + `requireAdmin` middleware).
- **File isolation** stays per-*user* (not per-org): uploads go to
  `uploads/<userId>/...`, outputs to `outputs/<userId>/...`, and
  downloads are served through an authenticated `/api/outputs/:filename`
  route that checks the resolved path stays inside that user's own
  directory. So within an org, one member still can't see another
  member's files by default — only that they're both part of the same
  organization. (If you want org-wide shared file access later, that's
  a deliberate further change, not something implied by this model.)
- The React app (`Auth.jsx`) offers "Create a new organization" or
  "Log in" — no separate open signup form. Admins get an extra
  **Admin** tab (`AdminPanel.jsx`) to add/remove users and reset
  passwords, gated on `user.role === "admin"` from the JWT.

**Known trade-off worth knowing:** usernames are unique across the
*entire* platform, not just within an org — two different
organizations can't both have a user named `john`. This was chosen to
keep login simple (no org selector). If that becomes a problem at your
scale, the fix is to make `(org_id, username)` the unique constraint
instead and add an org identifier to the login form.

**What this does *not* include yet**: no email at all in this model
(by design), so there's no email-based recovery if an admin forgets
their own password and there's no other admin in the org to reset it
for them — see the Platform superadmin section below, which is exactly
what fills that gap. Also still missing: login rate-limiting and audit
logging of admin/superadmin actions.

## Platform superadmin (break-glass account)

One account, above all organizations, that exists solely to reset a
password when an org's admin(s) are locked out with no one else in
that org able to help. It cannot see any organization's files or data
— only organization/username/role.

- **Never created through the API.** Set `SUPERADMIN_USERNAME` and
  `SUPERADMIN_PASSWORD` as env vars (Render dashboard, or `.env`
  locally); `authService.ensureSuperadminFromEnv()` runs once at
  server startup and creates that account if it doesn't already
  exist. Deliberately not an HTTP-creatable role — creating a platform
  superuser should require deploy-level access, not just an
  authenticated API call.
- `SUPERADMIN_USERNAME` follows the same rule as every other username:
  3-32 characters, letters/numbers/`_`/`.`/`-` only — **no `@`, so
  don't use an email address**. `SUPERADMIN_PASSWORD` needs 8+
  characters. Getting either wrong doesn't crash the app (see below);
  it just skips bootstrapping and logs why.
- Logs in through the same `POST /api/auth/login` as everyone else
  (username + password) — the frontend just routes them straight to a
  **Platform** tab (`SuperadminPanel.jsx`) instead of the normal
  org-scoped tabs, based on `role === "superadmin"` in the JWT.
- `GET /api/superadmin/organizations` — list every org with its users
  (to find who needs a reset).
- `POST /api/superadmin/users/:id/reset-password` — reset any user's
  password, in any org. Both require `requireSuperadmin` middleware.
- Only **one** superadmin account is bootstrapped this way. If you
  need more than one person to have break-glass access, the current
  setup doesn't support that without changing `ensureSuperadminFromEnv`
  — flagging that rather than pretending it's already handled.
- A misconfigured `SUPERADMIN_USERNAME`/`PASSWORD` (bad format, too
  short) is caught during startup and logged as a warning — the app
  still starts normally without the superadmin account, rather than
  crashing and taking every organization's access down with it. Check
  the deploy logs for "Superadmin bootstrap skipped" if you expect the
  account to exist and it doesn't.

## Coverage of your requirements

- **Compare Excel sheets** → `diff_excel_sheets` tool
  (`excelService.diffSheets`) for Claude's own reasoning, plus a
  dedicated `/api/compare-excel` endpoint and a **Compare Excel** tab
  in the frontend (`frontend/src/components/DiffView.jsx`) showing
  both sheets side-by-side with differing cells highlighted — not just
  Claude's text summary.
- **Analyze / report from raw data copying another report's format** →
  `fill_excel_template` (clones formatting, injects new values) or
  `buildWordDoc`/`fillWordTemplate` for narrative reports
- **All Excel functions incl. lookups** → `compute_excel_formulas` tool,
  powered by HyperFormula (a real spreadsheet engine, not string parsing)
- **Batch Word/email templates** → end-to-end now, via the **Batch
  templates** tab (`frontend/src/components/BatchTemplateFlow.jsx`):
  upload a `.docx` template with `{tag}` placeholders and an `.xlsx`
  data source (first row = headers matching the tags). `/api/batch-generate`
  reads every row (`excelService.sheetToObjects`), fills one document
  per row (`wordService.batchFillWordTemplate`), zips them (`archiver`),
  and returns a single download link.
- **Extract PDFs** → two tiers: `extract_pdf_text`/`extract_pdf_structured`
  need no extra setup and work for simple layouts; `extract_pdf_tables`
  calls the separate Python microservice in `pdf-extraction-service/`
  (FastAPI + `pdfplumber`) for real bordered/multi-column tables, which
  Node's PDF libraries genuinely can't do well. Set `PDF_SERVICE_URL`
  once that's deployed — the tool throws a clear error telling you to
  do so if it's missing, rather than silently degrading.
- **Read .eml files + attachments, summarize, draft a response** →
  `read_eml` tool (`emailService.parseEmlFile`) parses headers/body and
  saves attachments under that user's output directory, auto-extracting
  a text preview for PDF/Excel/Word attachments (Word via `mammoth`).
  Claude summarizes directly from that. `create_email_reply`
  (`emailService.buildReplyEml`) builds a proper `Re:`-threaded `.eml`
  file for the drafted response.
  **No sending, ever, by design**: there is no SMTP client or mail API
  call anywhere in this codebase. Draft files are prefixed `DRAFT-` and
  the body itself carries a `[DRAFT — NOT SENT]` banner, so a draft is
  unmistakable even out of context. A human opens the file, reviews it,
  and sends it from their own email client.
- **Rearrange data per command** → this is exactly what the orchestrator
  loop is for: Claude reads data via `read_excel`/`extract_pdf_*`,
  reasons about the rearrangement, and calls `write_excel` /
  `fill_word_template` with the reshaped result
- **Edit PDFs** → `pdfEditService.js` (via `pdf-lib`), exposed through
  the command box only — no dedicated UI tab, since this is expected
  to be used occasionally. Covers merge, split, delete/reorder/rotate
  pages, text watermarking, page numbering, and filling+flattening
  existing PDF form fields (`list_pdf_form_fields` first to discover
  what's fillable). What it deliberately can't do: rewrite existing
  body text in place — PDFs don't store text as editable paragraphs,
  so that's a format limitation, not a gap in the tool.

## Local setup

Requires a local Postgres (or a free hosted one, e.g. via `docker run
-p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres`).

```bash
# Backend
cd backend
cp .env.example .env   # add ANTHROPIC_API_KEY, DATABASE_URL, and a random JWT_SECRET
npm install
npm run dev             # http://localhost:3001 — creates the users table on first run

# Frontend (separate terminal)
cd frontend
npm install
npm run dev              # http://localhost:5173
```

## Deploying

This is a monorepo with **one Blueprint** at the repo root (`render.yaml`)
that defines all three Render-hosted pieces together — the Postgres
database, the Node backend, and the Python PDF microservice — each
scoped to its own subfolder via `rootDir`. Render looks for
`render.yaml` at the repo root by default, so this only works as one
file, not the three separate ones from earlier iterations of this
project (if you have those checked out, delete `backend/render.yaml`
and `pdf-extraction-service/render.yaml` — this repo's root one
replaces both).

- **Render**: Dashboard → "New" → "Blueprint" → point it at this repo.
  Render shows a preview of all three resources before creating
  anything. It provisions the Postgres database, generates
  `JWT_SECRET`, and auto-wires `PDF_SERVICE_URL` to the PDF
  microservice's internal address via `fromService` — no manual URL
  copy-paste needed. After deploy, you still set two secrets yourself
  in the dashboard (deliberately not committed to the Blueprint):
  `ANTHROPIC_API_KEY`, and `SUPERADMIN_USERNAME`/`SUPERADMIN_PASSWORD`
  if you want the platform superadmin bootstrapped.
- Render suits the backend better than Vercel serverless functions
  because file processing and multi-step Claude tool loops can run
  longer than typical serverless timeouts, and it needs a writable
  disk for uploads/outputs.
- **Frontend → Vercel**, separately (Blueprints are Render-only, so
  this isn't in `render.yaml`): set Root Directory to `frontend`, and
  set `VITE_BACKEND_URL` to the backend's Render URL. Once you know
  your Vercel URL, add it to the backend's `ALLOWED_ORIGINS` on
  Render (comma-separated if you have more than one, e.g. a custom
  domain) — the backend rejects requests from origins not on that
  list, except `*.vercel.app` preview URLs, which are always allowed
  automatically so per-branch previews keep working without updating
  this list for every one.
- The PDF microservice is optional — deploying without it just means
  `extract_pdf_tables` errors with a clear message telling you it
  isn't configured, and the app falls back to the lighter
  `pdf-parse`-based extraction for everything else.

**Free-tier trade-offs worth knowing before you rely on it:**
- Free web services spin down after 15 minutes of no traffic — the
  first request after that takes 30-60 seconds to wake back up. Fine
  for testing/low-traffic use, not great for something people expect
  to respond instantly.
- Render's free Postgres databases expire after 90 days unless
  upgraded to a paid instance — this one holds your user accounts, so
  put a reminder somewhere before that deadline hits.

## Known gaps to fill in next (not yet built)

- File persistence: uploads/outputs currently live on local disk —
  fine for a single Render instance, but you'll want S3/R2/Cloudflare
  storage (still scoped per user) before scaling to multiple instances
  or long-term retention.
- Account management: no login rate limiting or audit logging of admin
  actions yet — see the trade-offs noted in the Multi-tenant section above.
- No usage limits per account — every user currently shares the same
  `ANTHROPIC_API_KEY` with no per-user quota, so one heavy user can
  consume the whole budget. Worth adding before real multi-tenant use.
- Scanned/image-only PDFs still need OCR — pdfplumber (used by the
  Python service) reads text/table structure, not pixels.
- Preserving full source formatting when comparing sheets with
  different layouts (currently assumes roughly aligned rows/columns).
- Sending email is intentionally **not** a feature and shouldn't be
  added without deliberate thought about the risk of an agent sending
  mail on someone's behalf — keep a human review-and-send step in the
  loop even if you later integrate a real mail API for other reasons.
