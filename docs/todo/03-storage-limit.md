# TODO 03: 용량 제한 시스템 구현

## 목적
플랜별 Library 개수 제한 및 파일 업로드 용량 제한 시스템 구현

## 작업 내용

### 1. Library 생성 시 개수 제한

**파일**: `server-demo/api/src/library/library.service.ts`

**수정 위치**: createLibrary 메서드

```typescript
import { SubscriptionService } from '@/billing/subscription/subscription.service';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService, // 추가
  ) {}

  async createLibrary(userId: string, dto: CreateLibraryDto): Promise<Library> {
    // 1. 플랜별 Library 개수 제한 확인
    const libraryLimit = await this.subscriptionService.getLibraryLimit(userId);

    if (libraryLimit !== null) {
      const currentCount = await this.prisma.library.count({
        where: {
          userId,
          deletedAt: null,
        },
      });

      if (currentCount >= libraryLimit) {
        const plan = await this.subscriptionService.getCurrentPlan(userId);
        throw new BadRequestException(
          `${plan.name} plan allows maximum ${libraryLimit} library(ies). ` +
          `Please upgrade your plan to create more libraries.`
        );
      }
    }

    // 2. Library 생성
    return this.prisma.library.create({
      data: {
        userId,
        name: dto.name,
        storageUsed: 0,
      },
    });
  }
}
```

---

### 2. 파일 업로드 시 용량 제한

**파일**: `server-demo/api/src/library/library-private.service.ts`

**수정 위치**: pushLibrary 메서드

```typescript
import { SubscriptionService } from '@/billing/subscription/subscription.service';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class LibraryPrivateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly subscriptionService: SubscriptionService, // 추가
  ) {}

  async pushLibrary(
    userId: string,
    files: Express.Multer.File[],
    libraryId: string,
    deletedFiles: string[],
  ): Promise<LibraryMetadata> {
    // 1. Library 소유권 확인
    const library = await this.prisma.library.findFirst({
      where: {
        id: libraryId,
        userId,
        deletedAt: null,
      },
    });

    if (!library) {
      throw new BadRequestException('Library not found or access denied');
    }

    // 2. 현재 사용량 및 용량 제한 조회
    const currentUsage = await this.subscriptionService.getStorageUsage(userId);
    const storageLimit = await this.subscriptionService.getStorageLimit(userId);

    // 3. 업로드할 파일 크기 계산
    const uploadSize = files.reduce((sum, file) => sum + file.size, 0);

    // 4. 용량 초과 확인
    if (currentUsage + uploadSize > storageLimit) {
      const availableSpace = storageLimit - currentUsage;
      const plan = await this.subscriptionService.getCurrentPlan(userId);

      throw new BadRequestException(
        `Insufficient storage space.\n` +
        `Current plan: ${plan.name}\n` +
        `Available space: ${this.subscriptionService.formatBytes(availableSpace)}\n` +
        `Upload size: ${this.subscriptionService.formatBytes(uploadSize)}\n` +
        `Please upgrade your plan for more storage.`
      );
    }

    // 5. 삭제된 파일 처리
    if (deletedFiles && deletedFiles.length > 0) {
      let totalDeletedSize = 0;

      for (const filePath of deletedFiles) {
        const fullPath = `user-libraries/${userId}/${libraryId}/private/${filePath}`;

        try {
          // 파일 크기 조회 (GCS에서)
          const fileSize = await this.storageService.getFileSize(fullPath);
          totalDeletedSize += fileSize;

          // 파일 삭제
          await this.storageService.deleteFile(fullPath);
        } catch (error) {
          console.error(`Failed to delete file: ${fullPath}`, error);
        }
      }

      // Library storageUsed 감소
      if (totalDeletedSize > 0) {
        await this.prisma.library.update({
          where: { id: libraryId },
          data: {
            storageUsed: {
              decrement: totalDeletedSize,
            },
          },
        });
      }
    }

    // 6. 파일 업로드
    const uploadedFiles: string[] = [];

    for (const file of files) {
      const filePath = `user-libraries/${userId}/${libraryId}/private/${file.originalname}`;

      try {
        await this.storageService.uploadFile(filePath, file.buffer, file.mimetype);
        uploadedFiles.push(file.originalname);
      } catch (error) {
        console.error(`Failed to upload file: ${file.originalname}`, error);
        throw new BadRequestException(`File upload failed: ${file.originalname}`);
      }
    }

    // 7. Library storageUsed 증가
    await this.prisma.library.update({
      where: { id: libraryId },
      data: {
        storageUsed: {
          increment: uploadSize,
        },
      },
    });

    // 8. 메타데이터 반환
    return {
      libraryId,
      uploadedFiles,
      deletedFiles: deletedFiles || [],
      totalSize: uploadSize,
    };
  }
}
```

---

### 3. StorageService에 파일 크기 조회 메서드 추가

**파일**: `server-demo/api/src/common/module/storage/storage.service.ts`

**추가 메서드**:

```typescript
/**
 * GCS 파일 크기 조회
 */
async getFileSize(gcpPath: string): Promise<number> {
  const bucket = this.storage.bucket(this.bucketName);
  const file = bucket.file(gcpPath);

  const [exists] = await file.exists();
  if (!exists) {
    throw new NotFoundException('File not found');
  }

  const [metadata] = await file.getMetadata();
  return parseInt(metadata.size || '0');
}

/**
 * 파일 삭제
 */
async deleteFile(gcpPath: string): Promise<void> {
  const bucket = this.storage.bucket(this.bucketName);
  const file = bucket.file(gcpPath);

  await file.delete();
}
```

---

### 4. LibraryModule에 SubscriptionModule import

**파일**: `server-demo/api/src/library/library.module.ts`

**수정**:

```typescript
import { SubscriptionModule } from '@/billing/subscription/subscription.module';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    SubscriptionModule, // 추가
  ],
  controllers: [LibraryController, LibraryPrivateController],
  providers: [LibraryService, LibraryPrivateService],
  exports: [LibraryService],
})
export class LibraryModule {}
```

---

### 5. 사용량 조회 API 추가

**파일**: `server-demo/api/src/billing/subscription/subscription.controller.ts`

**추가 엔드포인트**:

```typescript
import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SubscriptionService } from './subscription.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /**
   * 현재 사용량 조회
   */
  @Get('usage')
  @UseGuards(JwtAuthGuard)
  async getUsage(@Request() req) {
    const userId = req.user.id;

    const plan = await this.subscriptionService.getCurrentPlan(userId);
    const storageLimit = await this.subscriptionService.getStorageLimit(userId);
    const storageUsed = await this.subscriptionService.getStorageUsage(userId);
    const libraryLimit = await this.subscriptionService.getLibraryLimit(userId);

    const librariesCount = await this.subscriptionService['prisma'].library.count({
      where: {
        userId,
        deletedAt: null,
      },
    });

    return {
      plan: {
        name: plan.name,
        description: plan.description,
        storageLimit: storageLimit,
        storageLimitFormatted: this.subscriptionService.formatBytes(storageLimit),
        libraryLimit: libraryLimit,
      },
      usage: {
        librariesCount,
        totalStorageUsed: storageUsed,
        totalStorageUsedFormatted: this.subscriptionService.formatBytes(storageUsed),
        percentage: Math.round((storageUsed / storageLimit) * 100),
      },
    };
  }

  /**
   * 현재 구독 조회
   */
  @Get('current')
  @UseGuards(JwtAuthGuard)
  async getCurrentSubscription(@Request() req) {
    const userId = req.user.id;
    const subscription = await this.subscriptionService.getCurrentSubscription(userId);
    const plan = await this.subscriptionService.getCurrentPlan(userId);

    return {
      subscription,
      plan,
    };
  }
}
```

---

## 체크리스트

- [ ] LibraryService에 SubscriptionService 의존성 주입
- [ ] createLibrary에 Library 개수 제한 로직 추가
- [ ] LibraryPrivateService에 SubscriptionService 의존성 주입
- [ ] pushLibrary에 용량 제한 확인 로직 추가
- [ ] pushLibrary에서 파일 업로드 후 storageUsed 증가
- [ ] pushLibrary에서 파일 삭제 시 storageUsed 감소
- [ ] StorageService에 getFileSize 메서드 추가
- [ ] StorageService에 deleteFile 메서드 추가
- [ ] LibraryModule에 SubscriptionModule import
- [ ] SubscriptionController에 usage 엔드포인트 추가
- [ ] SubscriptionController에 current 엔드포인트 추가

---

## 테스트 시나리오

### 1. FREE 플랜 Library 개수 제한
- [ ] FREE 플랜 사용자로 Library 1개 생성 성공
- [ ] FREE 플랜 사용자로 Library 2개 생성 시도 시 에러 발생
- [ ] 에러 메시지에 "최대 1개의 Library만 생성할 수 있습니다" 포함

### 2. FREE 플랜 용량 제한
- [ ] FREE 플랜 사용자가 총 500MB 이하 업로드 성공
- [ ] FREE 플랜 사용자가 500MB 초과 업로드 시도 시 에러 발생
- [ ] 에러 메시지에 사용 가능 공간, 업로드 시도 크기 정보 포함

### 3. 파일 삭제 시 용량 감소
- [ ] 파일 업로드 후 storageUsed 증가 확인
- [ ] 파일 삭제 후 storageUsed 감소 확인
- [ ] 사용량 조회 API로 정확한 용량 확인

### 4. 사용량 조회 API
- [ ] GET /subscription/usage 호출 성공
- [ ] 응답에 plan 정보 포함 (name, storageLimit, libraryLimit)
- [ ] 응답에 usage 정보 포함 (librariesCount, totalStorageUsed, percentage)

---

## 완료 조건

- FREE 플랜 사용자는 Library를 1개만 생성할 수 있음
- FREE 플랜 사용자는 총 500MB까지만 업로드 가능
- BASIC 플랜 사용자는 Library 무제한, 5GB까지 업로드 가능
- PREMIUM 플랜 사용자는 Library 무제한, 10GB까지 업로드 가능
- 파일 삭제 시 storageUsed가 올바르게 감소함
- 사용량 조회 API가 정확한 정보를 반환함

---

## 다음 단계

04-ai-permission.md로 이동하여 AI 권한 관리 시스템 구현
