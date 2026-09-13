import { Request, Response, NextFunction } from 'express';
import prisma, { setTenantContext } from '../lib/prisma';
import logger from '../utils/logger';

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.user?.tenantSlug) {
    next();
    return;
  }

  const host = req.headers.host || '';
  const slug = host.split('.')[0];

  if (!slug || slug === 'localhost' || slug === 'www' || slug === 'app' || slug === 'api') {
    res.status(400).json({
      type: 'https://httpstatuses.io/400',
      title: 'Bad Request',
      detail: 'Could not determine tenant from subdomain',
      status: 400,
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
      ...req.user!,
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
