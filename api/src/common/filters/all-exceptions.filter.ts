import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as any).message as string) || exception.message;
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';

      // Log unexpected errors
      this.logger.error(
        `Unhandled exception: ${String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const errorResponse = {
      success: false,
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      error: HttpStatus[status],
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Error logging (4xx as WARN, 5xx as ERROR)
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${status} - ${message}`,
      );
    } else if (status >= 400) {
      this.logger.warn(
        `${request.method} ${request.url} ${status} - ${message}`,
      );
    }

    response.status(status).json(errorResponse);
  }
}
