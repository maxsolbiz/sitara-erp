import { Request, Response, NextFunction } from 'express';
import { isIP } from 'net';
import { getRedis } from '../lib/redis';
import logger from '../utils/logger';

interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
  keyPrefix: string;
}

// Resolved lazily inside the factory (not as a module-level snapshot):
// dotenv only runs in config/index.ts, so reading process.env at import
// time sees pre-dotenv values and silently applies prod limits in dev.
// The auth limiter below already evaluates late (at route-setup time) —
// this mirrors that working pattern for the global default.
function defaultConfig(): RateLimitConfig {
  return {
    windowMs: 60 * 1000,
    maxAttempts: Number(process.env.RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'development' ? 200 : 600),
    keyPrefix: 'ratelimit',
  };
}

// Real client IP, normalized. req.ip is resolved by Express through the
// trust-proxy chain (loopback + Cloudflare ranges in index.ts); a direct
// client is an untrusted peer so its headers are ignored and req.ip is the
// peer itself. Anything non-IP (should not happen) falls back to a shared
// 'unknown' bucket: throttled, never bypassed. Never reads
// CF-Connecting-IP or X-Forwarded-For directly.
export function clientKey(req: Request): string {
  const raw = req.ip || req.socket.remoteAddress || '';
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  return isIP(ip) ? ip : 'unknown';
}

async function runCounter(
  req: Request,
  res: Response,
  next: NextFunction,
  key: string,
  cfg: RateLimitConfig,
): Promise<void> {
  const redis = getRedis();

  try {
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.pexpire(key, cfg.windowMs);
    }

    const ttl = await redis.pttl(key);

    res.setHeader('X-RateLimit-Limit', cfg.maxAttempts);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, cfg.maxAttempts - current));
    res.setHeader('X-RateLimit-Reset', Date.now() + ttl);

    if (current > cfg.maxAttempts) {
      logger.warn('Rate limit exceeded', { ip: req.ip, key });
      res.setHeader('Retry-After', Math.max(1, Math.ceil(ttl / 1000)));
      res.status(429).json({
        type: 'https://httpstatuses.io/429',
        title: 'Too Many Requests',
        detail: `Rate limit exceeded. Try again in ${Math.ceil(ttl / 1000)} seconds.`,
        status: 429,
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Rate limiter error', { error: (error as Error).message });
    next();
  }
}

export function rateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const cfg = { ...defaultConfig(), ...config };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `${cfg.keyPrefix}:${clientKey(req)}`;
    await runCounter(req, res, next, key, cfg);
  };
}

// Layer 2: per-user limiter, mounted AFTER authMiddleware (see
// routes/index.ts). Requests with an invalid or missing token never reach
// here with req.user set, so they fall back through to IP-only limiting
// and cannot use a user key to evade the IP limit.
export function userRateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const cfg = {
    windowMs: Number(process.env.USER_RATE_LIMIT_WINDOW_MS) || 60000,
    maxAttempts: Number(process.env.USER_RATE_LIMIT_MAX) || 300,
    keyPrefix: 'userlimit',
    ...config,
  };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next();
      return;
    }
    const key = `${cfg.keyPrefix}:${req.user.tenantId}:${req.user.userId}`;
    await runCounter(req, res, next, key, cfg);
  };
}

export function authRateLimitMiddleware() {
  if (process.env.NODE_ENV === 'development') {
    return rateLimitMiddleware({
      windowMs: 60 * 1000,
      maxAttempts: 100,
      keyPrefix: 'auth',
    });
  }
  return rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    maxAttempts: 5,
    keyPrefix: 'auth',
  });
}
