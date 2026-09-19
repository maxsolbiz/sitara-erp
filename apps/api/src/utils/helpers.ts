import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: { userId: bigint; tenantId: bigint; tenantSlug: string }): string {
  return jwt.sign(
    { sub: payload.userId.toString(), tid: payload.tenantId.toString(), slug: payload.tenantSlug, jti: uuidv4() },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as any }
  );
}

export function generateRefreshToken(payload: { userId: bigint; tenantId: bigint }): string {
  return jwt.sign(
    { sub: payload.userId.toString(), tid: payload.tenantId.toString(), jti: uuidv4() },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn as any }
  );
}

export function verifyAccessToken(token: string): { userId: string; tenantId: string; tenantSlug: string; jti?: string; exp?: number } | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    return { userId: decoded.sub, tenantId: decoded.tid, tenantSlug: decoded.slug, jti: decoded.jti, exp: decoded.exp };
  } catch {
    // Intentional: invalid/expired token is expected control flow, not a server error.
    return null;
  }
}

export function verifyRefreshToken(token: string): { userId: string; tenantId: string; jti: string } | null {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret) as any;
    return { userId: decoded.sub, tenantId: decoded.tid, jti: decoded.jti };
  } catch {
    // Intentional: invalid/expired token is expected control flow, not a server error.
    return null;
  }
}

export function generateSaleNumber(prefix: string = 'SAL'): string {
  const date = new Date();
  const yy = date.getFullYear().toString().slice(-2);
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const seq = uuidv4().slice(0, 6).toUpperCase();
  return `${prefix}-${yy}${mm}${dd}-${seq}`;
}

export function generateSku(name: string, categoryCode: string): string {
  const prefix = categoryCode.slice(0, 3).toUpperCase();
  const namePart = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
  const seq = uuidv4().slice(0, 4).toUpperCase();
  return `${prefix}-${namePart}-${seq}`;
}

export function formatPkr(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `Rs. ${num.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Authenticated-user id for audit columns (createdBy/approvedBy/...).
 * Fail-closed: every route using this sits behind authMiddleware, so a
 * missing req.user means the middleware chain is miswired — a server bug,
 * never a client error. Callers must let this throw (route catch → 500),
 * never fall back to a hardcoded id (old `: 1` pattern forged user 1).
 */
export function requireAuthUserId(req: { user?: { userId: string } | null }): bigint {
  if (!req.user) throw new Error('Missing authenticated user');
  return BigInt(req.user.userId);
}

/**
 * Parse a route :id param into a bigint.
 * Returns null for empty, non-numeric, or non-positive values instead of
 * throwing (BigInt('abc')) or silently coercing (BigInt('') === 0n).
 * Callers should return 400 when this returns null.
 */
export function parseIdParam(raw: unknown): bigint | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^[1-9][0-9]*$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}
