import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

/**
 * Rate Limit Guard
 * Limits the number of requests from a single IP address.
 * Maximum 100 requests per 15 minutes.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly store: RateLimitStore = {};
  private readonly windowMs = 15 * 60 * 1000; // 15 minutes
  private readonly maxRequests = 100; // Maximum 100 requests per 15 minutes

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = this.getKey(request);
    const now = Date.now();

    // Check existing record
    const record = this.store[key];

    if (!record || now > record.resetTime) {
      // Start new window
      this.store[key] = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      return true;
    }

    // Increase request count
    record.count++;

    // Check if limit exceeded
    if (record.count > this.maxRequests) {
      throw new HttpException(
        {
          success: false,
          message: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil((record.resetTime - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getKey(request: Request): string {
    // Generate key based on IP address
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  // Periodic cleanup for memory management (Redis recommended for production)
  cleanup(): void {
    const now = Date.now();
    Object.keys(this.store).forEach((key) => {
      if (now > this.store[key].resetTime) {
        delete this.store[key];
      }
    });
  }
}
