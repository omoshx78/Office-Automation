import { verifyToken } from "../services/authService.js";

export function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Use after `authenticate`. Restricts a route to users with the
 * 'admin' role within their own organization — e.g. creating/removing
 * other users. Regular members get a 403, not a silent no-op.
 */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/**
 * Use after `authenticate`. Restricts a route to the platform
 * superadmin only — the break-glass account, not org admins.
 */
export function requireSuperadmin(req, res, next) {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({ error: "Superadmin access required" });
  }
  next();
}
