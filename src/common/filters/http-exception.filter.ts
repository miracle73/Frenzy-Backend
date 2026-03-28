import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const requestId = request.id;

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;
    const message = this.getMessage(exceptionResponse, status);
    const error = this.getError(exceptionResponse);

    response.status(status).json({
      statusCode: status,
      status,
      message,
      msg: message,
      error,
      path: request.url,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private getMessage(
    exceptionResponse: string | object | null,
    status: number,
  ): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (exceptionResponse && typeof exceptionResponse === 'object') {
      const responseMessage = (exceptionResponse as { message?: string | string[] })
        .message;
      if (Array.isArray(responseMessage)) {
        return responseMessage.join(', ');
      }
      if (typeof responseMessage === 'string') {
        return responseMessage;
      }
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'Internal server error';
    }

    return 'Request failed';
  }

  private getError(exceptionResponse: string | object | null): string | undefined {
    if (exceptionResponse && typeof exceptionResponse === 'object') {
      const responseError = (exceptionResponse as { error?: string }).error;
      if (responseError) {
        return responseError;
      }
    }

    return undefined;
  }
}
