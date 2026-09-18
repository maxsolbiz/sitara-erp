import * as Sentry from '@sentry/node';
import { config } from '../config';

let started = false;

/**
 * Initialize Sentry error tracking. Dormant unless SENTRY_DSN is set —
 * with an empty DSN this is a no-op and the app behaves exactly as
 * before (winston console/file only). Error-only: no tracing, no
 * profiling, so there is no per-request overhead when enabled.
 */
export function initSentry(): void {
  if (started) return;
  if (!config.sentry.dsn) return;
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.nodeEnv,
    tracesSampleRate: 0,
  });
  started = true;
}

export function isSentryEnabled(): boolean {
  return started;
}

/**
 * Explicit report for high-value security events that log at warn level
 * (and therefore bypass the error-only winston bridge), e.g. refresh
 * token reuse detection. No-op unless Sentry is initialized.
 */
export function reportError(err: unknown, extra?: Record<string, unknown>): void {
  if (!started) return;
  Sentry.captureException(err, extra ? { extra } : undefined);
}
