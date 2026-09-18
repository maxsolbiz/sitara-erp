import * as Sentry from '@sentry/node';
import { config } from '../config';

let started = false;

/**
 * Keys that must never leave the process inside a Sentry event.
 * Conservative on purpose: anything shaped like a credential, token,
 * secret, or auth material is replaced wholesale, including nested
 * objects and serialized JSON bodies.
 */
const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|refresh|authorization|cookie|api[_-]?key|auth|credential|session/i;

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function scrubValue(v: unknown): unknown {
  // Recurse into containers; preserve scalars verbatim. Only values under
  // a sensitive KEY are replaced (see scrubRecord) — a blanket string
  // filter here would nuke every innocent value in the event.
  if (Array.isArray(v)) return v.map(scrubValue);
  if (isPlainRecord(v)) return scrubRecord(v);
  return v;
}

function scrubRecord(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '[Filtered]' : scrubValue(val);
  }
  return out;
}

/** Scrub `a=1&token=x` style query strings key-by-key. */
function scrubQueryString(qs: unknown): unknown {
  if (typeof qs !== 'string' || qs.length === 0) return qs;
  const prefix = qs.startsWith('?') ? '?' : '';
  const body = prefix ? qs.slice(1) : qs;
  const out = body.split('&').map((pair) => {
    const eq = pair.indexOf('=');
    if (eq === -1) return pair;
    const k = pair.slice(0, eq);
    return SENSITIVE_KEY_PATTERN.test(k) ? `${k}=[Filtered]` : pair;
  });
  return prefix + out.join('&');
}

function scrubUrl(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const q = raw.indexOf('?');
  if (q === -1) return raw;
  return raw.slice(0, q + 1) + String(scrubQueryString(raw.slice(q + 1)));
}

/** Exported for unit verification (scrub-check script). Same function wired into beforeSend below. */
export function scrubEvent(event: any): any {  const req = event?.request;
  if (req && typeof req === 'object') {
    if (isPlainRecord(req.headers)) req.headers = scrubRecord(req.headers);
    if (req.cookies !== undefined) req.cookies = '[Filtered]';
    if (typeof req.data === 'string') {
      try {
        req.data = JSON.stringify(scrubRecord(JSON.parse(req.data)));
      } catch {
        req.data = '[Filtered non-JSON body]';
      }
    } else if (isPlainRecord(req.data)) {
      req.data = scrubRecord(req.data);
    }
    if (req.query_string !== undefined) req.query_string = scrubQueryString(req.query_string);
    if (typeof req.url === 'string') req.url = scrubUrl(req.url);
  }
  if (isPlainRecord(event?.extra)) event.extra = scrubRecord(event.extra);
  return event;
}

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
    // NOTE: tracesSampleRate is deliberately OMITTED, not set to 0.
    // The SDK's hasTracingEnabled() treats a present key (even 0) as
    // "tracing enabled", which fires a bogus "express is not
    // instrumented" boot warning. Omitting the key disables tracing
    // for real — same effective behavior (error-only, no per-request
    // overhead), no warning.
    // Never collect PII/IPs by default, and scrub anything credential-
    // shaped before upload (verified against the installed SDK source:
    // request headers/cookies/body/query are otherwise sent verbatim).
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
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
