/**
 * 라이브러리 소유자 권한을 확인하는 가드
 *
 * 이 Guard는 요청한 사용자가 특정 라이브러리의 소유자인지 검사합니다.
 *
 * - 인증된 사용자만 접근 가능 (JwtAuthGuard 상속)
 * - URL 파라미터에서 libraryName을 추출하여 소유권 확인
 * - 소유자가 아닐 경우 요청을 거부(ForbiddenException)
 *
 * 주요 목적:
 * - Private 라이브러리 접근 보호
 * - 라이브러리 수정/삭제 등 소유자 전용 기능 보호
 */
import {
  ExecutionContext,
  Injectable,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/account/auth/jwt';
import { LibraryCommonService } from 'src/library/library-common.service';

@Injectable()
export class LibraryOwnerGuard extends JwtAuthGuard {
  constructor(
    @Inject(LibraryCommonService)
    private readonly libraryCommonService: LibraryCommonService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // JwtAuthGuard의 canActivate 호출 -> 인증 절차 먼저 실행
    const can = await super.canActivate(context);
    if (!can) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const libraryId = request.params.libraryId;

    if (!libraryId) {
      throw new BadRequestException('libraryId parameter is required');
    }

    // 라이브러리 소유권 확인
    const isOwner = await this.libraryCommonService.isLibraryOwner(
      user.id,
      libraryId,
    );

    if (!isOwner) {
      throw new ForbiddenException(
        'Access denied: You are not the owner of this library',
      );
    }

    return true;
  }
}
