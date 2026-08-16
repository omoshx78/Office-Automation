import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

/**
 * Create the organizations/users tables if they don't exist yet.
 * Called once at server startup. Kept as hand-written DDL rather than
 * a migration framework since the schema is intentionally small — add
 * a real migration tool (e.g. node-pg-migrate) before this grows, and
 * definitely before changing this schema on a database that already
 * has data in it (these CREATE TABLE IF NOT EXISTS statements won't
 * alter an existing differently-shaped table).
 *
 * Model: an organization is a tenant. Its first user (created via
 * registerOrganization) is an 'admin'. Only admins can create further
 * users in their org — there is no general public signup beyond
 * creating a brand new org. Usernames are unique platform-wide, which
 * keeps login simple (no "which organization" selector needed).
 *
 * A 'superadmin' role sits above all organizations (org_id is NULL for
 * these rows) and exists purely as a break-glass mechanism — e.g. an
 * org's only admin forgetting their password with no one else in the
 * org to reset it. Superadmins are never created through the API; see
 * authService.ensureSuperadminFromEnv().
 */
export async function initDb() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'superadmin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT org_membership_matches_role CHECK (
        (role = 'superadmin' AND org_id IS NULL) OR
        (role <> 'superadmin' AND org_id IS NOT NULL)
      )
    );
  `);
}
