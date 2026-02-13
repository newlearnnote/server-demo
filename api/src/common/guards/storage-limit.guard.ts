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
 * - 개별 파일: 10MB
 * - 배치 총 용량: 50MB
 * - 플랜별 총 용량: FREE 500MB, BASIC 5GB, PREMIUM 10GB
 */
@Injectable()
export class StorageLimitGuard implements CanActivate {
  // 상수 정의
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly BATCH_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB

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

    // 1. 업로드 파일 목록 가져오기
    const files: Express.Multer.File[] = request.files || [];

    // 업로드 파일이 없으면 통과
    if (files.length === 0) {
      return true;
    }

    // 2. 개별 파일 크기 제한 체크 (10MB, 모든 플랜 공통)
    const oversizedFiles = files.filter(
      (file) => file.size > this.MAX_FILE_SIZE,
    );

    if (oversizedFiles.length > 0) {
      const fileList = oversizedFiles
        .map(
          (file) =>
            `- ${file.originalname}: ${this.subscriptionService.formatBytes(file.size)}`,
        )
        .join('\n');

      throw new BadRequestException(
        `Individual file size exceeds limit.\n` +
          `File size limit: ${this.subscriptionService.formatBytes(this.MAX_FILE_SIZE)}\n` +
          `Oversized files:\n${fileList}\n` +
          `Please reduce file sizes or upload separately.`,
      );
    }

    // 3. 배치 총 용량 제한 체크 (50MB, 모든 플랜 공통)
    const uploadSize = files.reduce((sum, file) => sum + file.size, 0);

    if (uploadSize > this.BATCH_SIZE_LIMIT) {
      throw new BadRequestException(
        `Upload batch size exceeds limit.\n` +
          `Batch limit: ${this.subscriptionService.formatBytes(this.BATCH_SIZE_LIMIT)}\n` +
          `Your upload: ${this.subscriptionService.formatBytes(uploadSize)} (${files.length} files)\n` +
          `Please upload files in smaller batches.`,
      );
    }

    // 3. 현재 사용량 및 제한 조회
    const currentUsage =
      await this.libraryCommonService.getTotalStorageUsage(userId);
    const storageLimit = await this.subscriptionService.getStorageLimit(userId);

    // 4. 용량 초과 확인 (플랜별)
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
