# TODO 06: 구독 관리 API 및 결제 연동

## 목적
사용자가 플랜을 조회하고 업그레이드/다운그레이드할 수 있는 API 구현 및 결제 시스템과 연동

## 작업 내용

### 1. 구독 플랜 조회 API

**파일**: `server-demo/api/src/billing/subscription/subscription.controller.ts`

**추가 엔드포인트**:

```typescript
import { Controller, Get, Post, Body, UseGuards, Request, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SubscriptionService } from './subscription.service';

@ApiTags('Subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /**
   * 모든 플랜 조회 (인증 불필요)
   */
  @Get('plans')
  @ApiOperation({ summary: '모든 구독 플랜 조회' })
  async getPlans() {
    return this.subscriptionService.getAllPlans();
  }

  /**
   * 특정 플랜 조회 (인증 불필요)
   */
  @Get('plans/:planName')
  @ApiOperation({ summary: '특정 플랜 조회' })
  async getPlan(@Param('planName') planName: string) {
    return this.subscriptionService.getPlanByName(planName);
  }

  /**
   * 현재 구독 및 플랜 조회
   */
  @Get('current')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '현재 구독 조회' })
  async getCurrentSubscription(@Request() req) {
    const userId = req.user.id;
    const subscription = await this.subscriptionService.getCurrentSubscription(userId);
    const plan = await this.subscriptionService.getCurrentPlan(userId);

    return {
      subscription,
      plan,
    };
  }

  /**
   * 사용량 조회
   */
  @Get('usage')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '사용량 조회' })
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
        storageLimit,
        storageLimitFormatted: this.subscriptionService.formatBytes(storageLimit),
        libraryLimit,
      },
      usage: {
        librariesCount,
        totalStorageUsed: storageUsed,
        totalStorageUsedFormatted: this.subscriptionService.formatBytes(storageUsed),
        percentageUsed: Math.round((storageUsed / storageLimit) * 100),
      },
    };
  }
}
```

---

### 2. SubscriptionService에 플랜 조회 메서드 추가

**파일**: `server-demo/api/src/billing/subscription/subscription.service.ts`

**추가 메서드**:

```typescript
/**
 * 모든 플랜 조회
 */
async getAllPlans(): Promise<SubscriptionPlan[]> {
  return this.prisma.subscriptionPlan.findMany({
    where: {
      deletedAt: null,
    },
    orderBy: {
      price: 'asc',
    },
  });
}

/**
 * 플랜 이름으로 조회
 */
async getPlanByName(name: string): Promise<SubscriptionPlan> {
  const plan = await this.prisma.subscriptionPlan.findUnique({
    where: { name },
  });

  if (!plan) {
    throw new NotFoundException(`Plan ${name} not found`);
  }

  return plan;
}
```

---

### 3. 구독 업그레이드 API

**파일**: `server-demo/api/src/billing/subscription/subscription.controller.ts`

**추가 엔드포인트**:

```typescript
import { UpgradePlanDto } from './dto/upgrade-plan.dto';

@Post('upgrade')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: '플랜 업그레이드' })
async upgradePlan(
  @Request() req,
  @Body() dto: UpgradePlanDto,
) {
  const userId = req.user.id;
  return this.subscriptionService.upgradePlan(userId, dto.planName);
}
```

---

### 4. UpgradePlanDto 생성

**파일**: `server-demo/api/src/billing/subscription/dto/upgrade-plan.dto.ts` (신규 생성)

**내용**:

```typescript
import { IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpgradePlanDto {
  @ApiProperty({
    description: '업그레이드할 플랜 이름',
    enum: ['FREE', 'BASIC', 'PREMIUM'],
    example: 'PREMIUM',
  })
  @IsString()
  @IsIn(['FREE', 'BASIC', 'PREMIUM'])
  planName: string;
}
```

---

### 5. SubscriptionService에 업그레이드/다운그레이드 로직 추가

**파일**: `server-demo/api/src/billing/subscription/subscription.service.ts`

**추가 메서드**:

```typescript
import { BadRequestException } from '@nestjs/common';

/**
 * 플랜 업그레이드
 */
async upgradePlan(userId: string, newPlanName: string): Promise<Subscription> {
  const newPlan = await this.getPlanByName(newPlanName);
  const currentPlan = await this.getCurrentPlan(userId);

  // 현재 플랜과 동일한 경우
  if (currentPlan.name === newPlanName) {
    throw new BadRequestException('이미 동일한 플랜을 사용 중입니다.');
  }

  // FREE로 다운그레이드 시도
  if (newPlanName === 'FREE') {
    return this.downgradePlan(userId, newPlanName);
  }

  // 기존 구독 종료
  const currentSubscription = await this.getCurrentSubscription(userId);
  if (currentSubscription) {
    await this.prisma.subscription.update({
      where: { id: currentSubscription.id },
      data: {
        status: 'canceled',
        endDate: new Date(),
      },
    });
  }

  // 새 구독 생성
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1); // 1개월 후

  return this.prisma.subscription.create({
    data: {
      userId,
      planId: newPlan.id,
      status: 'active',
      startDate,
      endDate,
    },
  });
}

/**
 * 플랜 다운그레이드
 */
async downgradePlan(userId: string, newPlanName: string): Promise<Subscription> {
  const newPlan = await this.getPlanByName(newPlanName);

  // 용량 초과 확인
  const currentUsage = await this.getStorageUsage(userId);
  const newLimit = this.parseStorageLimit(newPlan.storageLimit);

  if (currentUsage > newLimit) {
    throw new BadRequestException(
      `다운그레이드할 수 없습니다. 현재 사용량(${this.formatBytes(currentUsage)})이 ` +
      `${newPlanName} 플랜의 제한(${this.formatBytes(newLimit)})을 초과합니다. ` +
      `파일을 삭제한 후 다시 시도하세요.`
    );
  }

  // FREE로 다운그레이드 시 Library 개수 확인
  if (newPlanName === 'FREE') {
    const libraryCount = await this.prisma.library.count({
      where: { userId, deletedAt: null },
    });

    if (libraryCount > 1) {
      throw new BadRequestException(
        `다운그레이드할 수 없습니다. FREE 플랜은 1개의 Library만 허용됩니다. ` +
        `현재 ${libraryCount}개의 Library가 있습니다. Library를 삭제한 후 다시 시도하세요.`
      );
    }
  }

  // 기존 구독 종료
  const currentSubscription = await this.getCurrentSubscription(userId);
  if (currentSubscription) {
    await this.prisma.subscription.update({
      where: { id: currentSubscription.id },
      data: {
        status: 'canceled',
        endDate: new Date(),
      },
    });
  }

  // 새 구독 생성
  return this.prisma.subscription.create({
    data: {
      userId,
      planId: newPlan.id,
      status: 'active',
      startDate: new Date(),
      endDate: null, // FREE는 만료 없음
    },
  });
}

/**
 * 구독 취소
 */
async cancelSubscription(userId: string): Promise<void> {
  const subscription = await this.getCurrentSubscription(userId);

  if (!subscription) {
    throw new NotFoundException('활성 구독이 없습니다.');
  }

  await this.prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: 'canceled',
      endDate: new Date(),
    },
  });

  // FREE 플랜으로 자동 전환
  await this.createFreeSubscription(userId);
}
```

---

### 6. 구독 취소 API

**파일**: `server-demo/api/src/billing/subscription/subscription.controller.ts`

**추가**:

```typescript
@Post('cancel')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: '구독 취소 (FREE로 전환)' })
async cancelSubscription(@Request() req) {
  const userId = req.user.id;
  await this.subscriptionService.cancelSubscription(userId);
  return { message: '구독이 취소되었습니다. FREE 플랜으로 전환되었습니다.' };
}
```

---

### 7. 결제 성공 시 구독 생성/업그레이드

**파일**: `server-demo/api/src/billing/payment/payment.controller.ts`

**웹훅 수정**:

```typescript
import { SubscriptionService } from '../subscription/subscription.service';

@Controller('payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly subscriptionService: SubscriptionService, // 추가
  ) {}

  @Post('webhook/toss')
  async handleTossWebhook(@Body() body: any) {
    // 결제 검증
    const payment = await this.paymentService.confirmPayment(body);

    if (payment.status === 'PAID') {
      // orderId에서 플랜 정보 추출
      // 예: "order_PREMIUM_user123_timestamp" -> "PREMIUM"
      const planName = this.extractPlanFromOrderId(payment.orderId);
      const userId = payment.userId; // Payment 모델에서 userId 조회 필요

      // 구독 생성 또는 업그레이드
      await this.subscriptionService.upgradePlan(userId, planName);
    }

    return { success: true };
  }

  private extractPlanFromOrderId(orderId: string): string {
    // orderId 형식: "order_PREMIUM_user123_timestamp"
    const parts = orderId.split('_');
    if (parts.length < 2) {
      throw new BadRequestException('Invalid orderId format');
    }
    return parts[1]; // "PREMIUM"
  }
}
```

---

### 8. PaymentModule에 SubscriptionModule import

**파일**: `server-demo/api/src/billing/payment/payment.module.ts`

**수정**:

```typescript
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [SubscriptionModule],
  controllers: [PaymentController],
  providers: [PaypalService, NaverpayService, TosspaymentsService],
  exports: [],
})
export class PaymentModule {}
```

---

## 체크리스트

- [ ] SubscriptionController에 plans 엔드포인트 추가
- [ ] SubscriptionController에 current 엔드포인트 추가
- [ ] SubscriptionController에 usage 엔드포인트 추가
- [ ] SubscriptionController에 upgrade 엔드포인트 추가
- [ ] SubscriptionController에 cancel 엔드포인트 추가
- [ ] UpgradePlanDto 생성
- [ ] SubscriptionService에 getAllPlans 메서드 추가
- [ ] SubscriptionService에 getPlanByName 메서드 추가
- [ ] SubscriptionService에 upgradePlan 메서드 추가
- [ ] SubscriptionService에 downgradePlan 메서드 추가
- [ ] SubscriptionService에 cancelSubscription 메서드 추가
- [ ] 다운그레이드 시 용량 초과 검증
- [ ] 다운그레이드 시 Library 개수 검증
- [ ] PaymentController 웹훅에 구독 생성 로직 추가
- [ ] PaymentModule에 SubscriptionModule import
- [ ] Swagger 문서화

---

## 테스트 시나리오

### 1. 플랜 조회
- [ ] GET /subscription/plans 호출 시 3개 플랜(FREE, BASIC, PREMIUM) 반환
- [ ] GET /subscription/plans/PREMIUM 호출 시 PREMIUM 플랜 정보 반환

### 2. 현재 구독 조회
- [ ] 신규 가입 사용자: FREE 플랜 반환
- [ ] PREMIUM 구독 사용자: PREMIUM 플랜 반환

### 3. 업그레이드
- [ ] FREE → BASIC 업그레이드 성공
- [ ] FREE → PREMIUM 업그레이드 성공
- [ ] BASIC → PREMIUM 업그레이드 성공
- [ ] 기존 구독이 'canceled' 상태로 변경됨
- [ ] 새 구독이 'active' 상태로 생성됨

### 4. 다운그레이드
- [ ] PREMIUM → BASIC 다운그레이드 성공 (용량 5GB 이하일 때)
- [ ] PREMIUM → FREE 다운그레이드 성공 (용량 500MB 이하, Library 1개일 때)
- [ ] 용량 초과 시 다운그레이드 실패 및 에러 메시지 확인
- [ ] Library 2개 이상 시 FREE로 다운그레이드 실패

### 5. 구독 취소
- [ ] 구독 취소 시 FREE 플랜으로 자동 전환
- [ ] 기존 구독 상태가 'canceled'로 변경됨

### 6. 결제 연동
- [ ] 결제 성공 웹훅 수신 시 구독 자동 업그레이드
- [ ] orderId에서 플랜 이름 추출 확인

---

## 완료 조건

- 모든 구독 관련 API가 정상 동작함
- 업그레이드/다운그레이드 시 적절한 검증이 수행됨
- 결제 성공 시 구독이 자동으로 생성/업그레이드됨
- 구독 취소 시 FREE 플랜으로 전환됨
- Swagger 문서에 모든 API가 명시되어 있음

---

## 다음 단계

모든 기능 통합 테스트 및 프론트엔드 연동
