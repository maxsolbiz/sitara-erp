import prisma, { getTenantContext } from '../lib/prisma';
import logger from './logger';

export interface LogActivityParams {
  tenantId?: bigint;
  userId?: bigint | null;
  action: string;
  entityType: string;
  entityId?: bigint | null;
  description: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Best-effort activity log insert. NEVER throws and NEVER rejects —
 * a logging failure must not break or roll back the primary operation
 * it is attached to. Callers must still `await` it (or void it) so the
 * write is attempted, but any error is swallowed into a warning.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const tenantId = params.tenantId ?? getTenantContext()?.tenantId;
    if (!tenantId) {
      logger.warn('logActivity skipped: no tenant context', { action: params.action });
      return;
    }
    await prisma.activityLog.create({
      data: {
        tenantId,
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        description: params.description,
        oldValues: params.oldValues ?? undefined,
        newValues: params.newValues ?? undefined,
        ipAddress: params.ipAddress || '',
        userAgent: params.userAgent || '',
      },
    });
  } catch (e: any) {
    logger.warn('logActivity failed (primary operation unaffected)', {
      action: params.action,
      error: e.message,
    });
  }
}
