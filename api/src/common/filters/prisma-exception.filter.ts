import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { Response } from 'express';

@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: HttpStatus;
    let message: string;

    switch (exception.code) {
      case 'P2002':
        // Unique constraint violation
        status = HttpStatus.CONFLICT;
        message = this.getUniqueConstraintMessage(exception);
        break;
      case 'P2003':
        // Foreign key constraint violation
        status = HttpStatus.NOT_FOUND;
        message = '참조된 리소스를 찾을 수 없습니다.';
        break;
      case 'P2025':
        // Record not found - 낙관적 잠금 충돌인지 확인
        if (this.isOptimisticLockConflict(exception)) {
          status = HttpStatus.CONFLICT;
          message = '데이터가 다른 사용자에 의해 업데이트되었습니다.';
        } else {
          status = HttpStatus.NOT_FOUND;
          message = '요청된 리소스를 찾을 수 없습니다.';
        }
        break;
      case 'P2014':
        // Required relation violation
        status = HttpStatus.BAD_REQUEST;
        message = '필수 관계 데이터가 누락되었습니다.';
        break;
      case 'P2011':
        // Null constraint violation
        status = HttpStatus.BAD_REQUEST;
        message = '필수 필드가 누락되었습니다.';
        break;
      default:
        // Unknown Prisma error
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = '데이터베이스 작업 중 오류가 발생했습니다.';
        break;
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      message,
      error: exception.code,
    });
  }

  private getUniqueConstraintMessage(
    exception: PrismaClientKnownRequestError,
  ): string {
    const target = exception.meta?.target as string[];
    if (!target || target.length === 0) {
      return '중복된 데이터입니다.';
    }

    // 필드별 맞춤 메시지
    const field = target[0];
    switch (field) {
      case 'email':
        return '이미 사용 중인 이메일입니다.';
      case 'nickname':
        return '이미 사용 중인 닉네임입니다.';
      case 'name':
        return '이미 존재하는 이름입니다.';
      case 'jti':
        return '토큰이 이미 블랙리스트에 존재합니다.';
      default:
        return `중복된 ${field} 값입니다.`;
    }
  }

  private isOptimisticLockConflict(
    exception: PrismaClientKnownRequestError,
  ): boolean {
    // 낙관적 잠금 충돌은 where 조건에 version 필드가 포함된 경우
    // Prisma 메타데이터에서 version 필드 사용 여부를 확인
    const cause = exception.meta?.cause;
    if (typeof cause === 'string') {
      return (
        cause.includes('version') ||
        cause.includes(
          'Argument `where` of type UserWhereUniqueInput needs at least one argument',
        )
      );
    }
    return false;
  }
}
