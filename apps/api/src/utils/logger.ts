import winston from 'winston';
import TransportStream from 'winston-transport';
import * as Sentry from '@sentry/node';
import { config } from '../config';
import { isSentryEnabled } from '../lib/sentry';

/**
 * Forwards error-level logs to Sentry when initialized. Lazy-guarded per
 * log call (not at construction) so import order between logger and
 * sentry init never matters. Warn and below stay local-only — high-value
 * warn-level security events use reportError() explicitly instead.
 */
class SentryTransport extends TransportStream {
  log(info: any, next: () => void): void {
    if (info?.level === 'error' && isSentryEnabled()) {
      try {
        const { level, message, ...extra } = info;
        Sentry.captureMessage(String(message), { level: 'error', extra });
      } catch {
        // Sentry must never break logging.
      }
    }
    next();
  }
}

const logger = winston.createLogger({
  level: config.log.level,
  format: config.log.format === 'json'
    ? winston.format.json()
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new SentryTransport(),
  ],
});

export function createContextLogger(context: string) {
  return {
    info: (message: string, meta?: Record<string, unknown>) =>
      logger.info(message, { context, ...meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      logger.warn(message, { context, ...meta }),
    error: (message: string, meta?: Record<string, unknown>) =>
      logger.error(message, { context, ...meta }),
    debug: (message: string, meta?: Record<string, unknown>) =>
      logger.debug(message, { context, ...meta }),
  };
}

export default logger;
