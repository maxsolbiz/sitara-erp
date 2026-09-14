import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/helpers';
import prisma, { setTenantContext } from '../lib/prisma';
import logger from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        tenantId: string;
        tenantSlug: string;
        jti?: string;
      };
      geoLocation?: any;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      type: 'https://httpstatuses.io/401',
      title: 'Unauthorized',
      detail: 'Missing or invalid authorization header',
      status: 401,
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({
      type: 'https://httpstatuses.io/401',
      title: 'Unauthorized',
      detail: 'Invalid or expired access token',
      status: 401,
    });
    return;
  }

  req.user = payload;

  setTenantContext({
    tenantId: BigInt(payload.tenantId),
    tenantSlug: payload.tenantSlug,
  });

  // Session revocation check (DB lookup): a token whose session row exists
  // but isActive=false was explicitly terminated/logged-out → reject.
  // Tokens with no row at all (pre-feature tokens, test-generated tokens)
  // pass through, preserving backward compatibility.
  if (payload.jti) {
    const jti = payload.jti;
    prisma.userSession.findFirst({
      where: { sessionToken: jti },
      select: { isActive: true },
    }).then((session) => {
      if (session && !session.isActive) {
        res.status(401).json({
          type: 'https://httpstatuses.io/401',
          title: 'Unauthorized',
          detail: 'Session has been terminated',
          status: 401,
        });
        return;
      }
      next();
    }).catch((error) => {
      logger.error('Session check error', { error: (error as Error).message });
      next();
    });
    return;
  }

  next();
}

export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    if (payload) {
      req.user = payload;
      setTenantContext({
        tenantId: BigInt(payload.tenantId),
        tenantSlug: payload.tenantSlug,
      });
    }
  }

  next();
}
