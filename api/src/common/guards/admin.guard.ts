// 관리자 이상 즉 관리자 또는 슈퍼관리자 권한이 있는지 확인하는 가드
/**
 * 이 Guard는 요청한 사용자가 관리자 권한을 가지고 있는지 검사합니다.
 *
 * - 인증된 사용자만 접근 가능
 * - 사용자의 role 또는 isAdmin 필드를 확인하여 관리자 여부 판별
 * - 관리자가 아닐 경우 요청을 거부(ForbiddenException)
 * 주요 목적:
 * - 관리자 페이지, 관리자 API, 중요 설정 등 보호
 * - 일반 사용자의 접근을 차단
 */
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { user_role_enum } from '@prisma/client';
import { JwtAuthGuard } from 'src/account/auth/jwt';

// 역할이 ADMIN 또는 SUPER_ADMIN인지 확인
@Injectable()
export class AdminGuard extends JwtAuthGuard {
  constructor() {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // JwtAuthGuard의 canActivate 호출 -> user 설정 / 인증 절차 먼저 실행
    const can = await super.canActivate(context);
    if (!can) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new UnauthorizedException('User not found in request');

    // ADMIN 또는 SUPER_ADMIN 권한 체크
    const isAdmin =
      user.role === user_role_enum.admin ||
      user.role === user_role_enum.super_admin;
    if (!isAdmin) throw new UnauthorizedException('User is not an admin');

    // user가 존재하고 isAdmin이 true인 경우에만 true 반환
    return user && isAdmin;
  }
}
