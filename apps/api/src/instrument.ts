/**
 * Sentry instrumentation entry point.
 *
 * MUST remain the first import in index.ts (ahead of express and all
 * framework imports): the SDK can only instrument modules loaded after
 * Sentry.init() runs, and ESM evaluates imports in source order. Calling
 * initSentry() later in index.ts body is too late — express is already
 * loaded by then, which produced the "express is not instrumented"
 * boot warning. Do not move this import down or merge it elsewhere.
 */
import { initSentry } from './lib/sentry';

initSentry();
