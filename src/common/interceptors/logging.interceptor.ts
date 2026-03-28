import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string }>();
    const response = ctx.getResponse<Response>();
    const { method, originalUrl, body, query, params } = request;
    const requestId = request.id ?? 'n/a';
    const startedAt = Date.now();

    this.logger.log(
      `${method} ${originalUrl} - requestId=${requestId} ` +
        `body=${safeStringify(body)} query=${safeStringify(query)} params=${safeStringify(params)}`,
    );

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startedAt;
        this.logger.log(
          `${method} ${originalUrl} ${response.statusCode} - ${duration}ms ` +
            `requestId=${requestId} response=${safeStringify(data)}`,
        );
      }),
      catchError((error) => {
        const duration = Date.now() - startedAt;
        this.logger.error(
          `${method} ${originalUrl} ${response.statusCode || 500} - ${duration}ms ` +
            `requestId=${requestId} error=${error?.message ?? error}`,
          error?.stack,
        );
        return throwError(() => error);
      }),
    );
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}
