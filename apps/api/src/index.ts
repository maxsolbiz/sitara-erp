import './instrument';
import { Request, Response, NextFunction } from 'express';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

// BigInt serialization fix for JSON responses
BigInt.prototype.toJSON = function () {
  return this.toString();
};

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

import { config } from './config';
import logger from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import * as Sentry from '@sentry/node';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { authMiddleware } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';
import { registerRoutes } from './routes';
import { runWithTenantContext } from './lib/prisma';
import { TENANT_SLUG_PATTERN } from './constants/tenant';
import { CLOUDFLARE_IPV4, CLOUDFLARE_IPV6 } from './config/cloudflare-ips';
import { SERVER_OWN_ADDRESSES } from './config/self-addresses';
import { initGeoIP } from './services/geoip.service';
import { startCurrencySync } from './services/currency.service';

const app = express();

// Error tracking is initialized in ./instrument (first import above),
// dormant unless SENTRY_DSN is set.

// Trust the loopback reverse proxy (Apache on this box) plus the Cloudflare
// edge ranges so req.ip resolves to the real client: Cloudflare appends the
// real client to X-Forwarded-For and Apache appends the edge, and Express
// walks the chain right-to-left skipping trusted hops. A direct-to-origin
// client is an untrusted peer, so its spoofed headers are ignored. The
// server's own public addresses are trusted too, so app-host traffic that
// hairpins out through Cloudflare resolves past them to the real client.
app.set('trust proxy', ['loopback', ...CLOUDFLARE_IPV4, ...CLOUDFLARE_IPV6, ...SERVER_OWN_ADDRESSES]);

// Per-request tenant isolation boundary. Must be the FIRST middleware so the
// AsyncLocalStorage store is established before anything downstream runs —
// auth.ts / tenant.ts populate it via setTenantContext(), and all 222
// getTenantContext() readers + the Prisma extension then see only their own
// request's tenant, even under concurrent load.
app.use((_req, _res, next) => runWithTenantContext(null, next));

app.use(helmet({ contentSecurityPolicy: false }));
// Production origins are enumerated exactly — never loose regex. A previous
// allowlist ([/\.sitara\.pk$/, /^https:\/\/app\.sitara\./]) was removable:
// sitara.pk is not org-controlled, and the app.sitara. prefix was anchored
// at the start only, matching attacker subdomains like app.sitara.evil.com.
// Registered-domain suffix for validated origin reflection. The leading dot
// is load-bearing: 'evil-sitarapurse.com' and 'sitarapurse.com.evil.com'
// both fail the endsWith check. Label must additionally satisfy the same
// LDH pattern as tenant slugs (rejects nested 'a.b' labels too).
const SITARA_ORIGIN_SUFFIX = '.sitarapurse.com';
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // no Origin header: curl, server-to-server, same-origin
  let hostname: string;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;
    hostname = url.hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!hostname.endsWith(SITARA_ORIGIN_SUFFIX)) return false;
  const label = hostname.slice(0, -SITARA_ORIGIN_SUFFIX.length);
  return label.length > 0 && TENANT_SLUG_PATTERN.test(label);
}
app.use(cors({
  origin: config.nodeEnv === 'development' ? '*' : (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: { write: (message: string) => logger.info(message.trim()) },
  }));
}

app.use(rateLimitMiddleware());

app.get(`/${config.apiPrefix}/health`, (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

registerRoutes(app);

app.use(notFoundHandler);
// Sentry's Express error handler registers itself on the app (returns
// void) — it must come after routes so uncaught route errors report with
// request context, then flow to the app handler below.
Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, config.host, () => {
    logger.info(`Sitara API running on ${config.host}:${config.port}`, {
      env: config.nodeEnv,
      apiPrefix: config.apiPrefix,
    });
    initGeoIP();
    startCurrencySync();
  });
}

export default app;
