import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    req: Request & { id?: string },
    res: Response,
    next: NextFunction,
  ): void {
    const existingId = req.id;
    const headerId = req.headers['x-request-id'];
    const requestId =
      existingId ??
      (typeof headerId === 'string' && headerId.trim().length > 0
        ? headerId
        : randomUUID());

    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
