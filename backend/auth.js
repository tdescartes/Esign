// auth.js — password hashing, session issuance/validation, and requireAuth middleware.
//
// Sessions are opaque random tokens delivered in an httpOnly cookie. Only the
// SHA-256 hash of the token is ever stored — the raw token exists only in the
// signed-in browser's cookie, never at rest.

import { randomBytes, randomUUID, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";

export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "esign_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await pool.query(
    `INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES ($1,$2,$3,$4,$5)`,
    [randomUUID(), userId, hashToken(token), expiresAt.toISOString(), now.toISOString()]
  );
  return { token, expiresAt };
}

export async function revokeSession(token) {
  if (!token) return;
  await pool.query(`UPDATE sessions SET revoked_at=$1 WHERE token_hash=$2`, [
    new Date().toISOString(),
    hashToken(token),
  ]);
}

export async function getUserForToken(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > $2`,
    [hashToken(token), new Date().toISOString()]
  );
  return rows[0] || null;
}

// Express middleware: rejects the request unless a valid, unexpired,
// unrevoked session cookie is present. Attaches `req.user` on success.
export function requireAuth() {
  return async (req, res, next) => {
    try {
      const token = req.cookies?.[SESSION_COOKIE];
      const user = await getUserForToken(token);
      if (!user) return res.status(401).json({ error: "authentication required" });
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

