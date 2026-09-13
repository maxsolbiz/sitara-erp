import { PrismaClient } from '@prisma/client';

interface TenantContext {
  tenantId: bigint;
  tenantSlug: string;
}

let currentTenant: TenantContext | null = null;

export function setTenantContext(context: TenantContext | null) {
  currentTenant = context;
}

export function getTenantContext(): TenantContext | null {
  return currentTenant;
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
