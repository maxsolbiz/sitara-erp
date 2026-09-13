import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { ALL_PERMISSIONS_SET } from '../constants/permissions';

declare global {
  namespace Express {
    interface Request {
      __rbacCleared?: boolean;
    }
  }
}

export function rbacMiddleware(...permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        type: 'https://httpstatuses.io/401',
        title: 'Unauthorized',
        detail: 'Authentication required',
        status: 401,
      });
      return;
    }

    if (permissions.length === 0) {
      req.__rbacCleared = true;
      next();
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      for (const p of permissions) {
        if (!ALL_PERMISSIONS_SET.has(p)) {
          logger.warn(`Unknown permission slug used in rbacMiddleware: "${p}"`);
        }
      }
    }

    try {
      const prismaClient = (await import('../lib/prisma')).default;
      const { default: prisma } = await import('../lib/prisma');

      const userId = BigInt(req.user.userId);
      const tenantId = BigInt(req.user.tenantId);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { isSuperAdmin: true, status: true },
      });

      if (!user) {
        res.status(401).json({
          type: 'https://httpstatuses.io/401',
          title: 'Unauthorized',
          detail: 'User not found',
          status: 401,
        });
        return;
      }

      if (user.status !== 'active') {
        res.status(403).json({
          type: 'https://httpstatuses.io/403',
          title: 'Forbidden',
          detail: 'User account is not active',
          status: 403,
        });
        return;
      }

      if (user.isSuperAdmin) {
        req.__rbacCleared = true;
        next();
        return;
      }

      const userRoles = await prisma.roleUser.findMany({
        where: { userId },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      const userPermissions = new Set<string>();
      for (const ru of userRoles) {
        for (const rp of ru.role.permissions) {
          userPermissions.add(rp.permission.slug);
        }
      }

      const hasAll = permissions.every((p) => userPermissions.has(p));

      if (!hasAll) {
        logger.warn('RBAC denial', {
          userId: req.user.userId,
          permission: permissions.join(', '),
          path: req.path,
          method: req.method,
          ip: req.ip,
        });
        res.status(403).json({
          type: 'https://httpstatuses.io/403',
          title: 'Forbidden',
          detail: `Missing required permissions: ${permissions.join(', ')}`,
          status: 403,
        });
        return;
      }

      req.__rbacCleared = true;
      next();
    } catch (error) {
      logger.error('RBAC middleware error', { error: (error as Error).message });
      res.status(500).json({
        type: 'https://httpstatuses.io/500',
        title: 'Internal Server Error',
        detail: 'Permission check failed',
        status: 500,
      });
    }
  };
}

export function roleMiddleware(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        type: 'https://httpstatuses.io/401',
        title: 'Unauthorized',
        detail: 'Authentication required',
        status: 401,
      });
      return;
    }

    if (roles.length === 0) {
      next();
      return;
    }

    try {
      const prisma = (await import('../lib/prisma')).default;
      const userId = BigInt(req.user.userId);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { isSuperAdmin: true },
      });

      if (user?.isSuperAdmin) {
        next();
        return;
      }

      const userRoles = await prisma.roleUser.findMany({
        where: { userId },
        include: { role: { select: { slug: true } } },
      });

      const roleSlugs = userRoles.map((ru) => ru.role.slug);
      const hasRole = roles.some((r) => roleSlugs.includes(r));

      if (!hasRole) {
        res.status(403).json({
          type: 'https://httpstatuses.io/403',
          title: 'Forbidden',
          detail: `Requires one of roles: ${roles.join(', ')}`,
          status: 403,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Role middleware error', { error: (error as Error).message });
      res.status(500).json({ status: 500, title: 'Internal Server Error', detail: 'Role check failed' });
    }
  };
}
