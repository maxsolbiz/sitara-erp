import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.headers['x-request-id'] || 'unknown';

  logger.error('Unhandled error', {
    requestId,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    method: req.method,
    url: req.url,
  });

  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;
    if (prismaErr.code === 'P2002') {
      res.status(409).json({
        type: 'https://httpstatuses.io/409',
        title: 'Conflict',
        detail: 'A record with this value already exists',
        status: 409,
      });
      return;
    }
    if (prismaErr.code === 'P2025') {
      res.status(404).json({
        type: 'https://httpstatuses.io/404',
        title: 'Not Found',
        detail: 'The requested record was not found',
        status: 404,
      });
      return;
    }
    if (prismaErr.code === 'P2003') {
      res.status(400).json({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        detail: 'Referenced record does not exist',
        status: 400,
      });
      return;
    }
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({
      type: 'https://httpstatuses.io/401',
      title: 'Unauthorized',
      detail: 'Invalid or expired token',
      status: 401,
    });
    return;
  }

  res.status(500).json({
    type: 'https://httpstatuses.io/500',
    title: 'Internal Server Error',
    detail: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    status: 500,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    type: 'https://httpstatuses.io/404',
    title: 'Not Found',
    detail: `Route ${req.method} ${req.url} not found`,
    status: 404,
  });
}
