import prisma from '../lib/prisma';

/**
 * Determines whether a user should see only their own records ('own')
 * or all records in the tenant ('all') based on their role assignments.
 *
 * Cache is per-request — call once per route handler and reuse the result.
 */
let requestCache = new Map<string, { expiry: number; scope: 'own' | 'all' }>();

export function clearScopeCache() {
  requestCache.clear();
}

export async function getUserScope(
  userId: bigint,
  tenantId: bigint,
  ttlMs = 5 * 60 * 1000
): Promise<'own' | 'all'> {
  const cacheKey = `${tenantId}:${userId}`;
  const cached = requestCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.scope;
  }

  const assignments = await prisma.roleUser.findMany({
    where: { userId },
    include: { role: { select: { slug: true } } },
  });

  const roleSlugs = assignments.map((r) => r.role.slug);

  // Superadmins bypass role checks everywhere else (cf. rbacMiddleware), so
  // they see all records even with no explicit role assignment.
  let scope: 'own' | 'all';
  if (roleSlugs.some((s) => ['admin', 'manager', 'accountant'].includes(s))) {
    scope = 'all';
  } else {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
    // Admin, Manager, Accountant see all records
    scope = user?.isSuperAdmin ? 'all' : 'own';
  }

  requestCache.set(cacheKey, { expiry: Date.now() + ttlMs, scope });
  return scope;
}
