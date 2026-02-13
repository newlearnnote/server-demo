# TODO 02: 구독 서비스 구현

## 목적
사용자의 현재 구독 플랜을 조회하고, 플랜별 제한사항을 확인하는 서비스 로직 구현

## 작업 내용

### 1. SubscriptionService 메서드 추가

**파일**: `server-demo/api/src/billing/subscription/subscription.service.ts`

**추가할 메서드**:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { Subscription, SubscriptionPlan } from '@prisma/client';

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 현재 활성 구독 조회
   */
  async getCurrentSubscription(userId: string): Promise<Subscription | null> {
    return this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'active',
        deletedAt: null,
      },
      include: {
        plan: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * 현재 구독 플랜 조회 (없으면 FREE)
   */
  async getCurrentPlan(userId: string): Promise<SubscriptionPlan> {
    const subscription = await this.getCurrentSubscription(userId);

    if (subscription && subscription.plan) {
      return subscription.plan;
    }

    // 구독이 없으면 FREE 플랜 반환
    const freePlan = await this.prisma.subscriptionPlan.findUnique({
      where: { name: 'FREE' },
    });

    if (!freePlan) {
      throw new NotFoundException('FREE plan not found. Please run seed.');
    }

    return freePlan;
  }

  /**
   * FREE 플랜 구독 생성 (회원가입 시 자동 호출)
   */
  async createFreeSubscription(userId: string): Promise<Subscription> {
    const freePlan = await this.prisma.subscriptionPlan.findUnique({
      where: { name: 'FREE' },
    });

    if (!freePlan) {
      throw new NotFoundException('FREE plan not found');
    }

    return this.prisma.subscription.create({
      data: {
        userId,
        planId: freePlan.id,
        status: 'active',
        startDate: new Date(),
        endDate: null, // FREE는 만료 없음
      },
    });
  }

  /**
   * AI 기능 사용 가능 여부 확인
   */
  async hasAiAccess(userId: string): Promise<boolean> {
    const plan = await this.getCurrentPlan(userId);
    const aiFeatures = plan.aiFeatures as { chat?: boolean; documentAnalysis?: boolean };
    return aiFeatures?.chat === true || aiFeatures?.documentAnalysis === true;
  }

  /**
   * 저장 용량 제한 조회 (바이트 단위)
   */
  async getStorageLimit(userId: string): Promise<number> {
    const plan = await this.getCurrentPlan(userId);
    return this.parseStorageLimit(plan.storageLimit);
  }

  /**
   * 현재 저장 용량 사용량 조회 (바이트 단위)
   */
  async getStorageUsage(userId: string): Promise<number> {
    const result = await this.prisma.library.aggregate({
      where: {
        userId,
        deletedAt: null,
      },
      _sum: {
        storageUsed: true,
      },
    });

    return Number(result._sum.storageUsed || 0);
  }

  /**
   * Library 생성 제한 개수 조회
   * FREE: 1, BASIC/PREMIUM: null (무제한)
   */
  async getLibraryLimit(userId: string): Promise<number | null> {
    const plan = await this.getCurrentPlan(userId);
    return plan.name === 'FREE' ? 1 : null;
  }

  /**
   * 저장 용량 문자열을 바이트로 변환
   * 예: "500MB" -> 524288000, "5GB" -> 5368709120
   */
  private parseStorageLimit(limit: string): number {
    const units: Record<string, number> = {
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };

    const match = limit.match(/^(\d+)(MB|GB|TB)$/);
    if (!match) {
      throw new Error(`Invalid storage limit format: ${limit}`);
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * 바이트를 읽기 쉬운 형식으로 변환
   * 예: 524288000 -> "500 MB"
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}
```

---

### 2. AuthService에 FREE 플랜 자동 할당 추가

**파일**: `server-demo/api/src/account/auth/auth.service.ts`

**수정**:

```typescript
import { SubscriptionService } from '@/billing/subscription/subscription.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly subscriptionService: SubscriptionService, // 추가
  ) {}

  async validateGoogleUser(googleUser: GoogleUser): Promise<AuthResult> {
    let user = await this.authRepository.findUserByOauthId(
      googleUser.id,
      'google',
    );

    if (!user) {
      user = await this.authRepository.findUserByEmail(googleUser.email);
      if (user) {
        throw new Error('User Email already exists');
      } else {
        // 신규 사용자 생성
        const createUserDto: CreateGoogleUserDto = {
          oauthId: googleUser.id,
          email: googleUser.email,
          firstName: googleUser.firstName || 'User',
          lastName: googleUser.lastName || Math.floor(100000 + Math.random() * 900000).toString(),
        };

        const createProfileDto: CreateProfileDto = {
          nickname: `${googleUser.firstName}${Math.floor(100000 + Math.random() * 900000).toString()}`.toLowerCase(),
          avatarUrl: googleUser.picture || process.env.AVATAR_DEFAULT_URL || '',
        };

        let isExisting = false;
        for (let i = 0; i < 5; i++) {
          isExisting = await this.userService.isExistingNickname(createProfileDto.nickname);
          if (!isExisting) break;
          createProfileDto.nickname = `${createProfileDto.nickname}${Math.floor(100000 + Math.random() * 900000)}`;
        }

        user = await this.authRepository.createGoogleUser(createUserDto, createProfileDto);

        // FREE 플랜 구독 생성
        await this.subscriptionService.createFreeSubscription(user.id);
      }
    }

    return this.generateAuthResult(user);
  }
}
```

---

### 3. AuthModule에 SubscriptionModule import

**파일**: `server-demo/api/src/account/auth/auth.module.ts`

**수정**:

```typescript
import { SubscriptionModule } from '@/billing/subscription/subscription.module';

@Module({
  imports: [
    JwtModule.register({}),
    PassportModule,
    UserModule,
    SubscriptionModule, // 추가
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, JwtAuthStrategy, GoogleStrategy, GoogleDesktopStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

---

## 체크리스트

- [ ] SubscriptionService에 getCurrentSubscription 메서드 추가
- [ ] SubscriptionService에 getCurrentPlan 메서드 추가
- [ ] SubscriptionService에 createFreeSubscription 메서드 추가
- [ ] SubscriptionService에 hasAiAccess 메서드 추가
- [ ] SubscriptionService에 getStorageLimit 메서드 추가
- [ ] SubscriptionService에 getStorageUsage 메서드 추가
- [ ] SubscriptionService에 getLibraryLimit 메서드 추가
- [ ] parseStorageLimit 헬퍼 메서드 구현
- [ ] formatBytes 헬퍼 메서드 구현
- [ ] AuthService에 SubscriptionService 의존성 주입
- [ ] validateGoogleUser에서 신규 사용자 생성 시 FREE 구독 자동 생성
- [ ] AuthModule에 SubscriptionModule import

---

## 테스트 방법

1. 새 사용자로 Google 로그인
2. Prisma Studio로 Subscription 테이블 확인
3. 새 사용자에게 FREE 플랜 구독이 생성되었는지 확인
4. status가 'active'이고 planId가 FREE 플랜의 ID인지 확인

---

## 완료 조건

- 신규 회원가입 시 FREE 플랜 구독이 자동으로 생성됨
- getCurrentPlan 메서드가 정상적으로 플랜을 반환함
- hasAiAccess 메서드가 FREE/BASIC는 false, PREMIUM은 true 반환
- getStorageLimit 메서드가 올바른 바이트 값을 반환함 (FREE: 524288000, BASIC: 5368709120, PREMIUM: 10737418240)

---

## 다음 단계

03-storage-limit.md로 이동하여 용량 제한 시스템 구현
