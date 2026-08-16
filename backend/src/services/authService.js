import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = "7d";
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

if (!JWT_SECRET) {
  // Fail loudly at startup rather than silently signing tokens with
  // `undefined` — a common way multi-tenant auth quietly breaks.
  throw new Error("JWT_SECRET env var is required");
}

function validateUsername(username) {
  if (!username || !USERNAME_RE.test(username)) {
    const err = new Error(
      "Username must be 3-32 characters: letters, numbers, underscore, dot, or dash only"
    );
    err.statusCode = 400;
    throw err;
  }
}

function validatePassword(password) {
  if (!password || password.length < 8) {
    const err = new Error("Password must be at least 8 characters");
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Create a brand new organization (tenant) plus its first user, who
 * becomes that org's admin. This is the only self-service "signup" in
 * the system — it's how a new company/team starts using the app.
 * Everyone else in that org is added by the admin afterward.
 */
export async function registerOrganization(orgName, username, password) {
  if (!orgName || orgName.trim().length < 2) {
    const err = new Error("Organization name is required");
    err.statusCode = 400;
    throw err;
  }
  validateUsername(username);
  validatePassword(password);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT id FROM users WHERE username = $1", [
      username.toLowerCase(),
    ]);
    if (existing.rows.length > 0) {
      const err = new Error("That username is already taken");
      err.statusCode = 409;
      throw err;
    }

    const orgResult = await client.query(
      "INSERT INTO organizations (name) VALUES ($1) RETURNING id, name",
      [orgName.trim()]
    );
    const org = orgResult.rows[0];

    const passwordHash = await bcrypt.hash(password, 12);
    const userResult = await client.query(
      `INSERT INTO users (org_id, username, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, username, role, org_id`,
      [org.id, username.toLowerCase(), passwordHash]
    );
    const user = userResult.rows[0];

    await client.query("COMMIT");
    return { user: toUserView(user), org, token: signToken(user) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function login(username, password) {
  const result = await pool.query(
    "SELECT id, username, password_hash, role, org_id FROM users WHERE username = $1",
    [username?.toLowerCase()]
  );
  const row = result.rows[0];

  // Same error for "no such user" and "wrong password" — don't leak
  // which one it was.
  const invalid = () => {
    const err = new Error("Invalid username or password");
    err.statusCode = 401;
    throw err;
  };

  if (!row) invalid();
  const ok = await bcrypt.compare(password || "", row.password_hash);
  if (!ok) invalid();

  return { user: toUserView(row), token: signToken(row) };
}

/**
 * Admin-only: create another user directly inside the admin's own
 * organization. No email involved — the admin hands the person their
 * username and initial password out of band.
 */
export async function adminCreateUser(adminOrgId, username, password, role = "member") {
  validateUsername(username);
  validatePassword(password);
  if (!["admin", "member"].includes(role)) {
    const err = new Error("role must be 'admin' or 'member'");
    err.statusCode = 400;
    throw err;
  }

  const existing = await pool.query("SELECT id FROM users WHERE username = $1", [
    username.toLowerCase(),
  ]);
  if (existing.rows.length > 0) {
    const err = new Error("That username is already taken");
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `INSERT INTO users (org_id, username, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, role, org_id, created_at`,
    [adminOrgId, username.toLowerCase(), passwordHash, role]
  );
  return toUserView(result.rows[0]);
}

export async function adminListUsers(orgId) {
  const result = await pool.query(
    "SELECT id, username, role, created_at FROM users WHERE org_id = $1 ORDER BY created_at ASC",
    [orgId]
  );
  return result.rows;
}

/**
 * Admin-only: remove a user from their own org. Refuses to remove the
 * last remaining admin, so an org can never end up with no one able
 * to manage it.
 */
export async function adminDeleteUser(orgId, targetUserId) {
  const target = await pool.query("SELECT id, role FROM users WHERE id = $1 AND org_id = $2", [
    targetUserId,
    orgId,
  ]);
  if (target.rows.length === 0) {
    const err = new Error("User not found in your organization");
    err.statusCode = 404;
    throw err;
  }

  if (target.rows[0].role === "admin") {
    const adminCount = await pool.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE org_id = $1 AND role = 'admin'",
      [orgId]
    );
    if (adminCount.rows[0].count <= 1) {
      const err = new Error("Cannot remove the last admin of an organization");
      err.statusCode = 400;
      throw err;
    }
  }

  await pool.query("DELETE FROM users WHERE id = $1 AND org_id = $2", [targetUserId, orgId]);
}

/**
 * Admin-only: reset another user's password directly — this is the
 * account-recovery path that replaces "email me a reset link", since
 * there's no email address in this model.
 */
export async function adminResetPassword(orgId, targetUserId, newPassword) {
  validatePassword(newPassword);
  const target = await pool.query("SELECT id FROM users WHERE id = $1 AND org_id = $2", [
    targetUserId,
    orgId,
  ]);
  if (target.rows.length === 0) {
    const err = new Error("User not found in your organization");
    err.statusCode = 404;
    throw err;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, targetUserId]);
}

function toUserView(row) {
  return { id: row.id, username: row.username, role: row.role, orgId: row.org_id ?? null };
}

export function signToken(row) {
  return jwt.sign(
    { sub: row.id, username: row.username, role: row.role, orgId: row.org_id ?? null },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  return { id: payload.sub, username: payload.username, role: payload.role, orgId: payload.orgId ?? null };
}

/**
 * Bootstrap the single platform superadmin account from environment
 * variables at server startup. Deliberately not exposed as an API
 * route — creating a superadmin should require deploy-level access
 * (setting env vars in Render), not just an authenticated HTTP call.
 * No-ops if SUPERADMIN_USERNAME/SUPERADMIN_PASSWORD aren't set, or if
 * a user with that username already exists.
 */
export async function ensureSuperadminFromEnv() {
  const username = process.env.SUPERADMIN_USERNAME;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!username || !password) return;

  const existing = await pool.query("SELECT id, role FROM users WHERE username = $1", [
    username.toLowerCase(),
  ]);
  if (existing.rows.length > 0) return; // already bootstrapped

  validateUsername(username);
  validatePassword(password);
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (org_id, username, password_hash, role) VALUES (NULL, $1, $2, 'superadmin')`,
    [username.toLowerCase(), passwordHash]
  );
  console.log(`Bootstrapped superadmin account: ${username}`);
}

/**
 * Superadmin-only: list every organization along with its admins, so
 * the superadmin can find who to reset a password for without needing
 * any other access into that org's data.
 */
export async function platformListOrganizationsWithAdmins() {
  const result = await pool.query(`
    SELECT o.id AS org_id, o.name AS org_name, o.created_at AS org_created_at,
           u.id AS user_id, u.username, u.role
    FROM organizations o
    LEFT JOIN users u ON u.org_id = o.id
    ORDER BY o.created_at ASC, u.created_at ASC
  `);

  const orgsById = new Map();
  for (const row of result.rows) {
    if (!orgsById.has(row.org_id)) {
      orgsById.set(row.org_id, {
        id: row.org_id,
        name: row.org_name,
        createdAt: row.org_created_at,
        users: [],
      });
    }
    if (row.user_id) {
      orgsById.get(row.org_id).users.push({ id: row.user_id, username: row.username, role: row.role });
    }
  }
  return Array.from(orgsById.values());
}

/**
 * Superadmin-only: reset any user's password, in any organization —
 * the break-glass path for when an org's only admin is locked out and
 * there's no one else in that org to reset it for them.
 */
export async function platformResetPassword(targetUserId, newPassword) {
  validatePassword(newPassword);
  const target = await pool.query("SELECT id FROM users WHERE id = $1", [targetUserId]);
  if (target.rows.length === 0) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, targetUserId]);
}
