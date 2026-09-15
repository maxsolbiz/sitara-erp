import { Request, Response, NextFunction } from 'express';
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
    maxAttempts: process.env.NODE_ENV === 'development' ? 200 : 30,
    keyPrefix: 'ratelimit',
  };
}

export function rateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const cfg = { ...defaultConfig(), ...config };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `${cfg.keyPrefix}:${req.ip || req.socket.remoteAddress}`;
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
