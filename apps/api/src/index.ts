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
import { rateLimitMiddleware } from './middleware/rateLimit';
import { authMiddleware } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';
import { registerRoutes } from './routes';
import { runWithTenantContext } from './lib/prisma';
import { initGeoIP } from './services/geoip.service';
import { startCurrencySync } from './services/currency.service';

const app = express();

// Trust ONLY the loopback reverse proxy (Apache on this box) so req.ip
// reflects the X-Forwarded-For client instead of 127.0.0.1. Without this,
// every visitor shares one address and the per-IP rate limiter throttles
// the whole world as a single user. 'loopback' never trusts external hops.
app.set('trust proxy', 'loopback');

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
const allowedOrigins = [
  'https://app.sitarapurse.com',
  'https://api.sitarapurse.com',
];
app.use(cors({
  origin: config.nodeEnv === 'development' ? '*' : allowedOrigins,
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
