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
import { initGeoIP } from './services/geoip.service';
import { startCurrencySync } from './services/currency.service';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: config.nodeEnv === 'development' ? '*' : [/\.sitara\.pk$/, /^https:\/\/app\.sitara\./],
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
  app.listen(config.port, () => {
    logger.info(`Sitara API running on port ${config.port}`, {
      env: config.nodeEnv,
      apiPrefix: config.apiPrefix,
    });
    initGeoIP();
    startCurrencySync();
  });
}

export default app;
