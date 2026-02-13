# TODO 03: 용량 제한 시스템 구현 (Guard 패턴)

## 목적
플랜별 Library 개수 제한 및 파일 업로드 용량 제한 시스템 구현 (순환 의존성 없이)

## 아키텍처 설계

### 모듈 의존성 (단방향)
```
SubscriptionModule → LibraryModule (O)
LibraryModule → (의존성 없음)
Guards (모듈 독립) → SubscriptionService, LibraryCommonService 주입
```

**핵심:**
- Guard는 모듈에 속하지 않고 Controller/Route 레벨에서 등록
- Guard는 App DI 컨테이너에서 필요한 Service를 주입받음
- 모듈 간 순환 의존성 발생하지 않음

---

## 작업 내용

### 1. StorageService에 파일 크기 조회 메서드 추가

**파일**: `server-demo/api/src/common/module/storage/storage.service.ts`

**추가 메서드**:

```typescript
/**
 * GCS 파일 크기 조회
 * @param gcpPath GCS 파일 경로
 * @returns 파일 크기 (바이트)
 * @throws Error 파일이 존재하지 않는 경우
 */
async getFileSize(gcpPath: string): Promise<number> {
  const bucket = this.storage.bucket(this.bucketName);
  const file = bucket.file(gcpPath);

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`File not found: ${gcpPath}`);
  }

  const [metadata] = await file.getMetadata();
  const size = metadata.size;

  if (typeof size === 'number') {
    return size;
  }

  return parseInt(size || '0');
}
```

**Note**: `deleteFile` 메서드는 이미 존재함 (line 86-91)

---

### 2. LibraryLimitGuard 생성 (Library 개수 제한)

**파일**: `server-demo/api/src/common/guards/library-limit.guard.ts`

```typescript
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
    const currentCount = await this.libraryCommonService.getLibraryCount(userId);

    // 2. 플랜별 제한 조회
    const limit = await this.subscriptionService.getLibraryLimit(userId);

    // 3. 제한 확인 (null = 무제한)
    if (limit !== null && currentCount >= limit) {
      const plan = await this.subscriptionService.getCurrentPlan(userId);
      throw new BadRequestException(
        `${plan.name} plan allows maximum ${limit} library(ies). ` +
        `Current: ${currentCount}. ` +
        `Please upgrade your plan to create more libraries.`
      );
    }

    return true;
  }
}
```

---

### 3. StorageLimitGuard 생성 (용량 제한)

**파일**: `server-demo/api/src/common/guards/storage-limit.guard.ts`

```typescript
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
    const currentUsage = await this.libraryCommonService.getTotalStorageUsage(userId);
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
        `Please upgrade your plan for more storage.`
      );
    }

    return true;
  }
}
```

---

### 4. Controller에서 Guard 적용

**파일**: `server-demo/api/src/library/library-*.controller.ts`

```typescript
import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { LibraryLimitGuard } from '@/common/guards/library-limit.guard';
import { StorageLimitGuard } from '@/common/guards/storage-limit.guard';

// Library 생성 Controller
@Controller('library')
@UseGuards(JwtAuthGuard)
export class LibraryController {
  @Post()
  @UseGuards(LibraryLimitGuard) // Library 개수 제한 체크
  async createLibrary(@Request() req, @Body() dto: CreateLibraryDto) {
    return this.libraryService.createLibrary(req.user.id, dto);
  }
}

// Library Private Controller
@Controller('library/private')
export class LibraryPrivateController {
  @Post('push')
  @UseGuards(JwtAuthGuard, StorageLimitGuard) // 용량 제한 체크
  async pushLibrary(
    @Request() req,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: PushLibraryDto,
  ) {
    return this.libraryPrivateService.pushLibrary(
      req.user.id,
      files,
      dto.libraryId,
      dto.deletedFiles,
    );
  }
}
```

**Note**: Service 레이어는 제한 체크 로직 없이 순수 비즈니스 로직만 처리

---

### 5. 모듈 정리 (순환 의존성 제거)

**SubscriptionModule** (단방향 의존)
```typescript
@Module({
  imports: [PrismaModule, LibraryModule], // LibraryModule만 import
  providers: [SubscriptionService, SubscriptionRepository],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
```

**LibraryModule** (의존성 없음)
```typescript
@Module({
  imports: [StorageModule, UserModule], // SubscriptionModule import 안 함!
  providers: [LibraryService, LibraryPrivateService, ...],
  exports: [LibraryCommonService, ...],
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

### 아키텍처 설계
- [x] 순환 의존성 제거 (Service 레이어 검증 패턴 적용)
- [x] ~~SubscriptionModule → LibraryModule~~ → **LibraryModule → SubscriptionModule** (단방향)
- [x] SubscriptionModule에서 LibraryModule import 제거
- [x] LibraryModule에 SubscriptionModule import 추가
- [x] SubscriptionService에서 LibraryCommonService 의존성 제거

### Guard 구현 → Service 레이어로 이동 ✅
- [x] ~~LibraryLimitGuard 생성~~ → `validateLibraryLimit()` private method
- [x] ~~StorageLimitGuard 생성~~ → `validateStorageLimit()` private method
- [x] 개별 파일 10MB 제한 → `validateFileSizes()` private method
- [x] 배치 총 용량 50MB 제한 → `validateBatchSize()` private method
- [x] 플랜별 총 용량 제한 → `validateStorageLimit()` private method
- [x] Guards 삭제 (책임 분리 원칙에 따라 Service로 이동)

### StorageService
- [x] getFileSize 메서드 추가
- [x] deleteFile 메서드 확인 (이미 존재)

### Controller 정리
- [x] LibraryAppController에서 StorageLimitGuard 제거
- [x] LibraryAppController에서 JwtAuthGuard, LibraryOwnerGuard만 유지
- [x] 검증 로직은 Service 레이어에서 수행

### Service 로직 구현
- [x] LibraryPrivateService에 검증 메서드 추가
  - [x] `validateLibraryLimit()` - 라이브러리 개수 제한
  - [x] `validateStorageLimit()` - 총 용량 제한
  - [x] `validateFileSizes()` - 개별 파일 10MB
  - [x] `validateBatchSize()` - 배치 50MB
- [x] `createLibrary()`에서 `validateLibraryLimit()` 호출
- [x] `pushLibrary()`에서 검증 메서드 호출
- [x] `overwriteLibrary()`에서 검증 메서드 호출
- [x] ✅ **완료**: `storageUsed` 필드 업데이트 로직 구현
  - [x] LibraryRepository에 `updateStorageUsed()`, `setStorageUsed()` 메서드 추가
  - [x] pushLibrary에서 파일 업로드 후 storageUsed 증가
  - [x] pushLibrary에서 파일 삭제 시 storageUsed 감소 (증분 업데이트)
  - [x] overwriteLibrary에서 전체 재계산 (storageUsed 재설정)

### API 구현
- [ ] SubscriptionController 생성 (선택 사항)
- [ ] SubscriptionController에 usage 엔드포인트 추가 (선택 사항)
- [ ] SubscriptionController에 current 엔드포인트 추가 (선택 사항)
- [ ] SubscriptionModule에 Controller 등록 (선택 사항)

**Note**: request.user.subscription으로 접근 가능하므로 별도 API 불필요할 수 있음

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
