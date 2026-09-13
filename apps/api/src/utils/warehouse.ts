import prisma from '../lib/prisma';

/**
 * Get the default warehouse for a tenant.
 * Returns the warehouse marked as default, or the first warehouse if none is default.
 * Throws if no warehouse exists at all.
 */
export async function getDefaultWarehouse(tenantId: bigint, tx?: any): Promise<bigint> {
  const db = tx || prisma;
  const warehouse = await db.warehouse.findFirst({
    where: { tenantId, isDefault: true },
  });
  if (warehouse) return warehouse.id;

  const fallback = await db.warehouse.findFirst({
    where: { tenantId },
    orderBy: { id: 'asc' },
  });
  if (!fallback) {
    throw new Error('No warehouse configured for this tenant');
  }
  return fallback.id;
}
