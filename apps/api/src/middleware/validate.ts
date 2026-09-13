import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validateMiddleware(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = schema.parse(req[source]);
      req[source] = data;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        res.status(422).json({
          type: 'https://httpstatuses.io/422',
          title: 'Validation Error',
          detail: 'Request validation failed',
          status: 422,
          errors,
        });
        return;
      }

      next(error);
    }
  };
}
