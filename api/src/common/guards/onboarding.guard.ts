// TODO: OnBoardingGuard:
// 로그인 여부(JwtAuthGuard 상속)
// + language null이 아닌지 체크 + firstName, lastName이 null 또는 빈문자열인지 체크

import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/account/auth/jwt';

@Injectable()
export class OnBoardingGuard extends JwtAuthGuard {
  constructor() {
    super();
  }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // JwtAuthGuard의 canActivate 호출 -> user 설정 / 인증 절차 먼저 실행
    const can = await super.canActivate(context);
    if (!can) return false;

    // user 정보가 온보딩이 완료되었는지 체크
    // request에서 user 정보 가져오기
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new UnauthorizedException('User not found in request');

    const profile = user.profile;

    // language null 체크 및 firstName, lastName 빈문자열 체크
    if (!profile || !profile.language) {
      throw new ForbiddenException('Language not set');
    }
    if (
      !user.firstName ||
      !user.lastName ||
      user.firstName.trim() === '' ||
      user.lastName.trim() === ''
    ) {
      throw new ForbiddenException('First name or last name is empty');
    }
    return true;
  }
}
