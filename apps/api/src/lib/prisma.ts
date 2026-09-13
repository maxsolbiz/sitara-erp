import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantContext {
  tenantId: bigint;
  tenantSlug: string;
}

// Per-request tenant context. Previously a plain module-global that leaked
// across concurrent requests (cross-tenant contamination); now scoped via
// AsyncLocalStorage so each request sees only its own context.
const tenantStorage = new AsyncLocalStorage<TenantContext | null>();

export function setTenantContext(context: TenantContext | null) {
  // Inside a request scope (runWithTenantContext) this sets the context for
  // that request only. Outside any scope (scripts, tests, seed) it sets the
  // root store, preserving the old behavior for non-server callers.
  tenantStorage.enterWith(context);
}

export function getTenantContext(): TenantContext | null {
  return tenantStorage.getStore() ?? null;
}

/**
 * Run `callback` inside a fresh per-request tenant scope. Mount as early as
 * possible in the middleware chain so every downstream reader (services,
 * Prisma extension) is isolated from other concurrent requests.
 */
export function runWithTenantContext<T>(context: TenantContext | null, callback: () => T): T {
  return tenantStorage.run(context, callback);
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? [{ level: 'query', emit: 'event' }, { level: 'error', emit: 'stdout' }, { level: 'warn', emit: 'stdout' }]
    : [{ level: 'error', emit: 'stdout' }],
});

if (process.env.NODE_ENV === 'development') {
  prisma.$on('query' as any, (e: any) => {
    if (e.query?.startsWith('--')) return;
    console.log(`[PRISMA] ${e.query} [${e.params}] ${e.duration}ms`);
  });
}

// Models that do NOT have a tenantId field (junction tables, global models)
const NON_TENANT_MODELS = new Set(['RoleUser', 'RolePermission']);

const extendedPrisma = prisma.$extends({
  name: 'multi-tenant-extension',
  query: {
    $allOperations({ model, operation, args, query }) {
      const ctx = getTenantContext();
      if (!ctx || model === 'Tenant' || (model && NON_TENANT_MODELS.has(model))) return query(args);

      if (operation === 'create') {
        const data = args.data as any;
        if (data && !data.tenantId && !data.tenant) {
          data.tenantId = ctx.tenantId;
        }
        return query(args);
      }

      if (
        ['findFirst', 'findMany', 'update', 'delete',
         'updateMany', 'deleteMany', 'count', 'aggregate', 'groupBy'].includes(operation)
      ) {
        const where = (args as any).where || {};
        (args as any).where = { ...where, tenantId: ctx.tenantId };
      }

      if (operation === 'upsert') {
        const create = (args as any).create || {};
        if (!create.tenantId) {
          (args as any).create = { ...create, tenantId: ctx.tenantId };
        }
      }

      return query(args);
    },
  },
});

export type ExtendedPrismaClient = typeof extendedPrisma;

export default extendedPrisma as ExtendedPrismaClient;
