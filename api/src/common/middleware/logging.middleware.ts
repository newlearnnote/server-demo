import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;

    // Exclude unnecessary logs (health check, favicon, etc.)
    const excludePaths = ['/health', '/metrics', '/favicon.ico'];
    if (excludePaths.some((path) => originalUrl.includes(path))) {
      return next();
    }

    const startTime = Date.now();

    // Log request start
    this.logger.debug(`--> ${method} ${originalUrl}`);

    res.on('finish', () => {
      const { statusCode } = res;
      const responseTime = Date.now() - startTime;
      const contentLength = res.get('content-length') || 0;

      const logMessage = `<-- ${method} ${originalUrl} [${statusCode}] - ${contentLength}b - ${responseTime}ms`;

      // Apply log level
      if (statusCode >= 500) {
        // Server error
        this.logger.error(`❌ ${logMessage}`);
      } else if (statusCode >= 400) {
        // Client error
        this.logger.warn(`⚠️ ${logMessage}`);
      } else if (statusCode >= 300) {
        // Redirect
        this.logger.debug(`🔀 ${logMessage}`);
      } else {
        // Success response
        // data logs
        this.logger.debug(`✅ ${logMessage}`);
      }
    });

    next();
  }
}
