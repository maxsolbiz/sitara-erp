import { Request, Response, NextFunction } from 'express';
import prisma, { setTenantContext } from '../lib/prisma';
import logger from '../utils/logger';
import { isReservedTenantSlug, TENANT_SLUG_PATTERN } from '../constants/tenant';

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.user?.tenantSlug) {
    next();
    return;
  }

  // No JWT tenant context — resolve from Host. Harden the label before it
  // touches the database: strip port, normalize case, enforce DNS-label
  // shape + reserved-subdomain block (single source of truth in
  // constants/tenant.ts, shared with registration validation).
  const rawHost = (req.headers.host || '').trim().toLowerCase();
  const hostname = rawHost.startsWith('[')
    ? rawHost.slice(0, rawHost.indexOf(']') + 1) // bracketed IPv6 literal — no port to strip
    : rawHost.split(':')[0]; // strip :port
  const slug = hostname.split('.')[0];

  if (!slug || !TENANT_SLUG_PATTERN.test(slug) || isReservedTenantSlug(slug)) {
    res.status(400).json({
      type: 'https://httpstatuses.io/400',
      title: 'Bad Request',
      detail: 'Could not determine tenant from subdomain',
      status: 400,
    });
    return;
  }

  // Explicit guard: without an authenticated user there is no account to
  // scope the resolution to. (All current call sites run after
  // authMiddleware so this is defense-in-depth, not a behavior change.)
  if (!req.user) {
    res.status(401).json({
      type: 'https://httpstatuses.io/401',
      title: 'Unauthorized',
      detail: 'Authentication required',
      status: 401,
    });
    return;
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, status: true },
    });

    if (!tenant) {
      res.status(404).json({
        type: 'https://httpstatuses.io/404',
        title: 'Not Found',
        detail: `Tenant "${slug}" not found`,
        status: 404,
      });
      return;
    }

    if (tenant.status === 'inactive' || tenant.status === 'suspended') {
      res.status(403).json({
        type: 'https://httpstatuses.io/403',
        title: 'Forbidden',
        detail: 'This account has been suspended. Please contact support.',
        status: 403,
      });
      return;
    }

    setTenantContext({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    });

    req.user = {
      ...req.user,
      tenantId: tenant.id.toString(),
      tenantSlug: tenant.slug,
    };

    next();
  } catch (error) {
    logger.error('Tenant middleware error', { error: (error as Error).message });
    res.status(500).json({
      type: 'https://httpstatuses.io/500',
      title: 'Internal Server Error',
      detail: 'Failed to resolve tenant',
      status: 500,
    });
  }
}
