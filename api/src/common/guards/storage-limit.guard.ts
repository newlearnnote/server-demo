import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { SubscriptionService } from '../../billing/subscription/subscription.service';
import { LibraryCommonService } from '../../library/library-common.service';

/**
 * 파일 업로드 용량 제한 Guard
 * FREE: 500MB, BASIC: 5GB, PREMIUM: 10GB
 */
@Injectable()
export class StorageLimitGuard implements CanActivate {
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

    // 1. 업로드 파일 크기 계산
    const files: Express.Multer.File[] = request.files || [];
    const uploadSize = files.reduce((sum, file) => sum + file.size, 0);

    // 업로드 파일이 없으면 통과
    if (uploadSize === 0) {
      return true;
    }

    // 2. 현재 사용량 및 제한 조회
    const currentUsage =
      await this.libraryCommonService.getTotalStorageUsage(userId);
    const storageLimit = await this.subscriptionService.getStorageLimit(userId);

    // 3. 용량 초과 확인
    if (currentUsage + uploadSize > storageLimit) {
      const availableSpace = storageLimit - currentUsage;
      const plan = await this.subscriptionService.getCurrentPlan(userId);

      throw new BadRequestException(
        `Insufficient storage space.\n` +
          `Current plan: ${plan.name}\n` +
          `Available space: ${this.subscriptionService.formatBytes(availableSpace)}\n` +
          `Upload size: ${this.subscriptionService.formatBytes(uploadSize)}\n` +
          `Storage used: ${this.subscriptionService.formatBytes(currentUsage)} / ${this.subscriptionService.formatBytes(storageLimit)}\n` +
          `Please upgrade your plan for more storage.`,
      );
    }

    return true;
  }
}
