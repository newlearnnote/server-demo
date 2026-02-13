import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { SubscriptionService } from '../../billing/subscription/subscription.service';
import { LibraryCommonService } from '../../library/library-common.service';

/**
 * Library 생성 개수 제한 Guard
 * FREE 플랜: 최대 1개, BASIC/PREMIUM: 무제한
 */
@Injectable()
export class LibraryLimitGuard implements CanActivate {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly libraryCommonService: LibraryCommonService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('User ID not found in request');
    }

    // 1. 현재 라이브러리 개수 조회
    const currentCount =
      await this.libraryCommonService.getLibraryCount(userId);

    // 2. 플랜별 제한 조회
    const limit = await this.subscriptionService.getLibraryLimit(userId);

    // 3. 제한 확인 (null = 무제한)
    if (limit !== null && currentCount >= limit) {
      const plan = await this.subscriptionService.getCurrentPlan(userId);
      throw new BadRequestException(
        `${plan.name} plan allows maximum ${limit} library(ies). ` +
          `Current: ${currentCount}. ` +
          `Please upgrade your plan to create more libraries.`,
      );
    }

    return true;
  }
}
