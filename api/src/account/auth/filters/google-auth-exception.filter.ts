import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(BadRequestException)
export class GoogleAuthExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Check if error is about existing email with different login method
    if (
      exception.message &&
      exception.message.includes('already exists with a different login method')
    ) {
      const message = encodeURIComponent(
        'Already exists with a different login method.',
      );
      return response.redirect(
        `${frontendUrl}/auth/signin?error=email_exists&message=${message}`,
      );
    }

    // Handle other authentication errors
    const message = encodeURIComponent(
      '로그인 중 오류가 발생했습니다. 다시 시도해주세요.',
    );
    return response.redirect(
      `${frontendUrl}/auth/signin?error=auth_failed&message=${message}`,
    );
  }
}
