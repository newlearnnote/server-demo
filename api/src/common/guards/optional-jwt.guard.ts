/**
 * OptionalAuthGuard - 선택적 인증 가드
 *
 * 이 Guard는 JWT 토큰이 있으면 인증하고, 없어도 통과시킵니다.
 *
 * - 토큰이 있으면 req.user에 사용자 정보 설정
 * - 토큰이 없거나 유효하지 않아도 요청을 차단하지 않음
 * - 로그인 여부에 따라 다른 동작이 필요한 엔드포인트에서 사용
 *
 * 주요 목적:
 * - Published 콘텐츠 접근 (로그인 없이도 가능하지만 로그인 시 추가 기능)
 * - 조건부 기능 제공 (로그인 사용자에게만 특정 데이터 노출)
 */
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    try {
      const [type, token] = request.headers.authorization?.split(' ') ?? [];

      if (type === 'Bearer' && token) {
        const payload = this.jwtService.verify(token);
        request['user'] = payload;
      }
    } catch (error) {
      // 토큰이 유효하지 않아도 통과 (선택적 인증이므로)
      // console.log('Optional JWT verification failed:', error.message);
    }

    return true; // 항상 통과
  }
}
