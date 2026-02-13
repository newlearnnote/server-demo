# PRD 구현 계획 - AI 어시스턴스 및 결제 시스템 통합

## 현재 상태 분석

### 기존 인프라

#### NestJS 서버 (server-demo/api)
- **결제 시스템**: 완성됨 (Toss, Naver, PayPal)
- **구독 모델**:
  - `Subscription`: status, startDate, endDate, userId, planId
  - `SubscriptionPlan`: name, price, storageLimit, aiFeatures
  - `Payment`: 결제 내역 관리
- **User 모델**: Subscription 관계 존재
- **Library 모델**: 기본 구조만 존재 (용량 제한 없음)

#### FastAPI 서버 (server-demo/ai)
- **RAG 파이프라인**: 구현 완료
- **문서 처리**: PDF, Markdown, Text 지원
- **채팅 기능**: documents, chats, messages, categories 라우터 존재
- **권한 관리**: Premium 사용자 검증 로직 없음

### 부족한 부분

1. **구독 플랜 데이터**: Free, Basic, Premium 플랜 정의 및 시딩 필요
2. **용량 제한 시스템**: Library 용량 추적 및 제한 로직 없음
3. **플랜별 기능 제한**: Library 개수 제한 로직 없음
4. **AI 권한 관리**: Premium 사용자만 AI 기능 사용 가능하도록 하는 Guard 없음
5. **NestJS ↔ FastAPI 통합**: 사용자 인증 정보 전달 및 검증 방식 미정의

---

## 구현 작업 목록

### 1. 데이터베이스 스키마 수정

#### 1.1 Library 모델 수정
**파일**: `server-demo/api/prisma/schema/service/library.prisma`

**추가 필드**:
```prisma
model Library {
    id          String  @id @default(ulid()) @db.VarChar(255)
    name        String  @db.VarChar(255)

    // ✅ 추가 필요
    storageUsed BigInt  @default(0) @db.BigInt // 바이트 단위

    // 관리용 필드
    version     Int         @default(1) @db.Integer
    linkedAt    DateTime    @default(now()) @db.Timestamp(6)
    createdAt   DateTime    @default(now()) @db.Timestamp(6)
    updatedAt   DateTime    @updatedAt @db.Timestamp(6)
    deletedAt   DateTime?   @db.Timestamp(6)

    // 관계 필드
    userId  String @db.VarChar(255)
    user    User @relation(fields: [userId], references: [id])
    notes   Note[]

    @@map("library")
}
```

**작업**:
- [ ] Library 모델에 `storageUsed` 필드 추가
- [ ] Prisma migration 생성 및 실행
- [ ] LibraryService에서 파일 업로드 시 `storageUsed` 업데이트 로직 추가

---

#### 1.2 SubscriptionPlan 기본 데이터 정의
**파일**: `server-demo/api/prisma/seed.ts` (생성 필요)

**시드 데이터**:
```typescript
const subscriptionPlans = [
  {
    name: 'FREE',
    description: '무료 플랜 - Library 1개, 500MB',
    price: 0,
    currency: 'USD',
    storageLimit: '500MB',
    aiFeatures: {
      chat: false,
      documentAnalysis: false,
    },
  },
  {
    name: 'BASIC',
    description: 'Basic 플랜 - Library 무제한, 5GB',
    price: 5.00,
    currency: 'USD',
    storageLimit: '5GB',
    aiFeatures: {
      chat: false,
      documentAnalysis: false,
    },
  },
  {
    name: 'PREMIUM',
    description: 'Premium 플랜 - Library 무제한, 10GB, AI 지원',
    price: 10.00,
    currency: 'USD',
    storageLimit: '10GB',
    aiFeatures: {
      chat: true,
      documentAnalysis: true,
    },
  },
];
```

**작업**:
- [ ] `prisma/seed.ts` 파일 생성
- [ ] SubscriptionPlan 시드 데이터 작성
- [ ] `package.json`에 seed 스크립트 추가
- [ ] 시드 실행 및 확인

---

#### 1.3 User 모델 수정 (선택)
**파일**: `server-demo/api/prisma/schema/account/user.prisma`

**고려 사항**:
- User 모델에 `currentPlanId` 필드를 추가할지, 아니면 Subscription 관계를 통해 조회할지 결정
- 성능을 위해 캐싱 레이어 추가 고려

**권장 방식**: Subscription 관계를 통해 조회 (데이터 정합성 유지)

---

### 2. 구독 관리 시스템 구현

#### 2.1 구독 서비스 확장
**파일**: `server-demo/api/src/billing/subscription/subscription.service.ts`

**필요 기능**:
```typescript
class SubscriptionService {
  // 현재 구독 조회
  async getCurrentSubscription(userId: string): Promise<Subscription | null>

  // 현재 플랜 조회
  async getCurrentPlan(userId: string): Promise<SubscriptionPlan>

  // 구독 생성 (회원가입 시 FREE 플랜 자동 할당)
  async createFreeSubscription(userId: string): Promise<Subscription>

  // 구독 업그레이드
  async upgradePlan(userId: string, newPlanName: string): Promise<Subscription>

  // 구독 다운그레이드
  async downgradePlan(userId: string, newPlanName: string): Promise<Subscription>

  // 구독 취소
  async cancelSubscription(userId: string): Promise<Subscription>

  // AI 기능 사용 가능 여부 확인
  async hasAiAccess(userId: string): Promise<boolean>

  // 저장 용량 제한 조회 (바이트)
  async getStorageLimit(userId: string): Promise<number>

  // 현재 사용량 조회
  async getStorageUsage(userId: string): Promise<number>
}
```

**작업**:
- [ ] SubscriptionService 메서드 구현
- [ ] 결제 성공 시 구독 생성/업그레이드 로직 추가
- [ ] 구독 만료 처리 (Cron Job 또는 웹훅)

---

#### 2.2 구독 API 엔드포인트 추가
**파일**: `server-demo/api/src/billing/subscription/subscription.controller.ts`

**API 목록**:
```typescript
// GET /subscription/plans - 모든 플랜 조회
@Get('plans')
async getPlans(): Promise<SubscriptionPlan[]>

// GET /subscription/current - 현재 구독 조회
@Get('current')
@UseGuards(JwtAuthGuard)
async getCurrentSubscription(@Request() req): Promise<SubscriptionResponse>

// POST /subscription/upgrade - 플랜 업그레이드
@Post('upgrade')
@UseGuards(JwtAuthGuard)
async upgradePlan(@Request() req, @Body() dto: UpgradePlanDto): Promise<PaymentResponse>

// POST /subscription/cancel - 구독 취소
@Post('cancel')
@UseGuards(JwtAuthGuard)
async cancelSubscription(@Request() req): Promise<void>

// GET /subscription/usage - 사용량 조회
@Get('usage')
@UseGuards(JwtAuthGuard)
async getUsage(@Request() req): Promise<UsageResponse>
```

**작업**:
- [ ] DTO 정의 (UpgradePlanDto, SubscriptionResponse, UsageResponse)
- [ ] 컨트롤러 메서드 구현
- [ ] Swagger 문서화 추가

---

### 3. 용량 제한 시스템 구현

#### 3.1 Library 생성 제한
**파일**: `server-demo/api/src/library/library.service.ts`

**로직**:
```typescript
async createLibrary(userId: string, dto: CreateLibraryDto): Promise<Library> {
  // 1. 현재 플랜 조회
  const plan = await this.subscriptionService.getCurrentPlan(userId);

  // 2. FREE 플랜인 경우 Library 개수 확인
  if (plan.name === 'FREE') {
    const libraryCount = await this.prisma.library.count({
      where: { userId, deletedAt: null },
    });

    if (libraryCount >= 1) {
      throw new BadRequestException('Free 플랜은 1개의 Library만 생성 가능합니다. Basic 플랜으로 업그레이드하세요.');
    }
  }

  // 3. Library 생성
  return this.prisma.library.create({ data: { userId, ...dto } });
}
```

**작업**:
- [ ] Library 생성 시 플랜 확인 로직 추가
- [ ] 에러 메시지 및 HTTP 상태 코드 정의

---

#### 3.2 파일 업로드 용량 제한
**파일**: `server-demo/api/src/library/library-private.service.ts` (pushLibrary 메서드)

**로직**:
```typescript
async pushLibrary(userId: string, files: Express.Multer.File[], libraryId: string, deletedFiles: string[]): Promise<LibraryMetadata> {
  // 1. 현재 사용량 조회
  const currentUsage = await this.subscriptionService.getStorageUsage(userId);

  // 2. 저장 용량 제한 조회
  const storageLimit = await this.subscriptionService.getStorageLimit(userId);

  // 3. 업로드할 파일 크기 계산
  const uploadSize = files.reduce((sum, file) => sum + file.size, 0);

  // 4. 용량 초과 확인
  if (currentUsage + uploadSize > storageLimit) {
    const availableSpace = storageLimit - currentUsage;
    throw new BadRequestException(
      `저장 용량이 부족합니다. (사용 가능: ${this.formatBytes(availableSpace)}, 필요: ${this.formatBytes(uploadSize)})`
    );
  }

  // 5. 파일 업로드 진행
  // ... 기존 로직

  // 6. Library storageUsed 업데이트
  await this.prisma.library.update({
    where: { id: libraryId },
    data: { storageUsed: { increment: uploadSize } },
  });

  return metadata;
}
```

**작업**:
- [ ] 용량 계산 및 검증 로직 추가
- [ ] 파일 업로드 성공 시 `storageUsed` 업데이트
- [ ] 파일 삭제 시 `storageUsed` 감소

---

#### 3.3 사용량 조회 API
**파일**: `server-demo/api/src/billing/subscription/subscription.controller.ts`

**응답 형식**:
```typescript
interface UsageResponse {
  plan: {
    name: string;
    storageLimit: number; // 바이트
    libraryLimit: number | null; // null = 무제한
  };
  usage: {
    librariesCount: number;
    totalStorageUsed: number; // 바이트
    percentage: number; // 사용률 (0-100)
  };
}
```

**작업**:
- [ ] 사용량 계산 서비스 메서드 구현
- [ ] API 엔드포인트 추가

---

### 4. AI 어시스턴스 권한 관리

#### 4.1 Premium Guard 생성
**파일**: `server-demo/api/src/common/guards/premium.guard.ts` (생성 필요)

**구현**:
```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SubscriptionService } from '@/billing/subscription/subscription.service';

@Injectable()
export class PremiumGuard implements CanActivate {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      throw new ForbiddenException('인증이 필요합니다.');
    }

    const hasAccess = await this.subscriptionService.hasAiAccess(userId);

    if (!hasAccess) {
      throw new ForbiddenException('AI 어시스턴스는 Premium 플랜 전용 기능입니다. 플랜을 업그레이드하세요.');
    }

    return true;
  }
}
```

**작업**:
- [ ] PremiumGuard 구현
- [ ] AI 관련 엔드포인트에 Guard 적용

---

#### 4.2 FastAPI 권한 검증 미들웨어
**파일**: `server-demo/ai/app/middleware/auth.py` (생성 필요)

**구현 방식 (2가지 옵션)**:

**옵션 1: NestJS에서 토큰 검증 후 FastAPI로 전달**
```python
from fastapi import Header, HTTPException
from typing import Optional

async def verify_premium_access(x_user_id: Optional[str] = Header(None)):
    """
    NestJS에서 이미 검증된 userId를 헤더로 받음
    """
    if not x_user_id:
        raise HTTPException(status_code=403, detail="Premium access required")
    return x_user_id
```

**옵션 2: FastAPI에서 직접 DB 조회**
```python
import httpx
from fastapi import Header, HTTPException

NESTJS_API_URL = "http://localhost:8000/api"

async def verify_premium_access(authorization: str = Header(...)):
    """
    FastAPI에서 NestJS API를 호출하여 권한 검증
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{NESTJS_API_URL}/subscription/has-ai-access",
            headers={"Authorization": authorization}
        )

        if response.status_code != 200:
            raise HTTPException(status_code=403, detail="Premium access required")

        data = response.json()
        if not data.get("hasAccess"):
            raise HTTPException(status_code=403, detail="Premium plan required for AI features")

        return data.get("userId")
```

**권장**: 옵션 1 (성능상 유리, NestJS에서 이미 Guard로 검증)

**작업**:
- [ ] FastAPI 미들웨어 구현
- [ ] 모든 AI 라우터에 의존성 추가
- [ ] NestJS → FastAPI 요청 시 헤더 전달 방식 정의

---

### 5. NestJS ↔ FastAPI 통합

#### 5.1 NestJS에서 FastAPI 호출 서비스 생성
**파일**: `server-demo/api/src/common/services/ai-client.service.ts` (생성 필요)

**구현**:
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class AiClientService {
  private readonly axiosInstance: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    const aiServerUrl = this.configService.get<string>('AI_SERVER_URL') || 'http://localhost:8001';

    this.axiosInstance = axios.create({
      baseURL: aiServerUrl,
      timeout: 30000,
    });
  }

  async uploadDocument(userId: string, file: Express.Multer.File) {
    const formData = new FormData();
    formData.append('file', file.buffer, file.originalname);

    return this.axiosInstance.post('/documents/upload', formData, {
      headers: {
        'X-User-Id': userId,
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  async sendMessage(userId: string, chatId: string, message: string) {
    return this.axiosInstance.post('/messages', {
      chat_id: chatId,
      message,
    }, {
      headers: {
        'X-User-Id': userId,
      },
    });
  }
}
```

**작업**:
- [ ] AiClientService 구현
- [ ] 환경 변수 `AI_SERVER_URL` 추가
- [ ] AI 관련 Controller 생성 (프록시 역할)

---

#### 5.2 AI 프록시 컨트롤러 생성
**파일**: `server-demo/api/src/ai/ai.controller.ts` (생성 필요)

**구현**:
```typescript
import { Controller, Post, Get, Body, Param, UploadedFile, UseGuards, Request, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PremiumGuard } from '@/common/guards/premium.guard';
import { AiClientService } from '@/common/services/ai-client.service';

@Controller('ai')
@UseGuards(JwtAuthGuard, PremiumGuard)
export class AiController {
  constructor(private readonly aiClient: AiClientService) {}

  @Post('documents/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.aiClient.uploadDocument(req.user.id, file);
  }

  @Post('chats/:chatId/messages')
  async sendMessage(
    @Request() req,
    @Param('chatId') chatId: string,
    @Body('message') message: string,
  ) {
    return this.aiClient.sendMessage(req.user.id, chatId, message);
  }

  @Get('chats/:chatId/messages')
  async getMessages(
    @Request() req,
    @Param('chatId') chatId: string,
  ) {
    return this.aiClient.getMessages(req.user.id, chatId);
  }
}
```

**작업**:
- [ ] AiController 구현
- [ ] AiModule 생성 및 AppModule에 등록
- [ ] Swagger 문서화

---

#### 5.3 FastAPI 라우터 수정
**파일**: `server-demo/ai/app/routers/documents.py`, `messages.py`, `chats.py`

**수정 사항**:
- 모든 엔드포인트에 `verify_premium_access` 의존성 추가
- `X-User-Id` 헤더에서 userId 추출

**예시**:
```python
from fastapi import APIRouter, Depends, Header
from typing import Optional

router = APIRouter()

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    user_id: str = Header(..., alias="X-User-Id")
):
    # 문서 업로드 로직
    # user_id를 사용하여 문서와 사용자 연결
    pass
```

**작업**:
- [ ] FastAPI 라우터에 `X-User-Id` 헤더 검증 추가
- [ ] 문서 및 채팅 데이터에 `user_id` 연결

---

### 6. 회원가입 시 FREE 플랜 자동 할당

#### 6.1 AuthService 수정
**파일**: `server-demo/api/src/account/auth/auth.service.ts`

**수정**:
```typescript
async validateGoogleUser(googleUser: GoogleUser): Promise<AuthResult> {
  let user = await this.authRepository.findUserByOauthId(googleUser.id, 'google');

  if (!user) {
    // 신규 사용자 생성
    user = await this.authRepository.createGoogleUser(createUserDto, createProfileDto);

    // ✅ FREE 플랜 구독 자동 생성
    await this.subscriptionService.createFreeSubscription(user.id);
  }

  return this.generateAuthResult(user);
}
```

**작업**:
- [ ] AuthService에 SubscriptionService 의존성 주입
- [ ] 회원가입 시 FREE 구독 생성 로직 추가

---

### 7. 결제 시스템과 구독 연동

#### 7.1 결제 성공 웹훅 처리
**파일**: `server-demo/api/src/billing/payment/payment.controller.ts`

**수정**:
```typescript
@Post('webhook/toss')
async handleTossWebhook(@Body() body: any) {
  // 결제 검증
  const payment = await this.paymentService.confirmPayment(body);

  // ✅ 구독 생성 또는 업그레이드
  if (payment.status === 'PAID') {
    const planName = this.extractPlanFromOrderId(payment.orderId); // "BASIC" 또는 "PREMIUM"
    await this.subscriptionService.upgradePlan(payment.userId, planName);
  }

  return { success: true };
}
```

**작업**:
- [ ] 결제 성공 시 구독 생성/업그레이드 로직 추가
- [ ] orderId 또는 metadata에서 플랜 정보 추출
- [ ] 구독 시작일, 종료일 설정 (월 단위)

---

## 환경 변수 추가

### NestJS (.env.development)
```env
# AI Server
AI_SERVER_URL=http://localhost:8001
```

### FastAPI (.env.development)
```env
# NestJS API (옵션 2 사용 시)
NESTJS_API_URL=http://localhost:8000/api
```

---

## 작업 우선순위

### Phase 1: 기본 인프라 (1주)
1. [ ] 데이터베이스 스키마 수정 (Library storageUsed)
2. [ ] SubscriptionPlan 시드 데이터 생성
3. [ ] SubscriptionService 메서드 구현
4. [ ] 회원가입 시 FREE 플랜 자동 할당

### Phase 2: 용량 제한 (1주)
5. [ ] Library 생성 개수 제한 (FREE: 1개)
6. [ ] 파일 업로드 용량 제한 (FREE: 500MB, BASIC: 5GB, PREMIUM: 10GB)
7. [ ] storageUsed 업데이트 로직
8. [ ] 사용량 조회 API

### Phase 3: AI 권한 관리 (1주)
9. [ ] PremiumGuard 구현
10. [ ] FastAPI 권한 검증 미들웨어
11. [ ] NestJS → FastAPI 프록시 구현
12. [ ] AI 관련 엔드포인트 보호

### Phase 4: 결제 연동 (1주)
13. [ ] 구독 API 엔드포인트 (조회, 업그레이드, 취소)
14. [ ] 결제 성공 시 구독 생성/업그레이드
15. [ ] 구독 만료 처리 (Cron Job)
16. [ ] 프론트엔드 연동 테스트

---

## 테스트 체크리스트

### 구독 관리
- [ ] 회원가입 시 FREE 플랜 자동 할당 확인
- [ ] FREE → BASIC 업그레이드
- [ ] FREE/BASIC → PREMIUM 업그레이드
- [ ] PREMIUM → BASIC 다운그레이드
- [ ] 구독 취소 후 FREE로 전환

### 용량 제한
- [ ] FREE 사용자: Library 1개만 생성 가능
- [ ] FREE 사용자: 500MB 초과 시 업로드 차단
- [ ] BASIC 사용자: Library 무제한, 5GB 제한
- [ ] PREMIUM 사용자: Library 무제한, 10GB 제한
- [ ] 파일 삭제 시 storageUsed 감소

### AI 권한
- [ ] FREE/BASIC 사용자: AI 엔드포인트 접근 차단 (403)
- [ ] PREMIUM 사용자: AI 기능 정상 사용
- [ ] NestJS → FastAPI 요청 시 userId 전달 확인

### 결제 연동
- [ ] 결제 성공 후 구독 자동 생성
- [ ] 구독 만료 후 다운그레이드
- [ ] 환불 시 구독 취소

---

## 추가 고려사항

### 1. 구독 만료 처리
- Cron Job으로 매일 만료된 구독 확인
- 만료 시 FREE 플랜으로 다운그레이드
- 용량 초과 시 파일 접근 제한 (삭제는 하지 않음)

### 2. 성능 최적화
- 사용자 플랜 정보 캐싱 (Redis)
- storageUsed 계산 최적화 (집계 테이블 또는 캐시)

### 3. 보안
- FastAPI 엔드포인트 직접 호출 방지 (내부 네트워크 또는 API Key)
- Signed URL 사용량 제한

### 4. 모니터링
- 플랜별 사용자 수 대시보드
- 용량 사용률 추이 분석
- AI 요청 빈도 모니터링

---

## 완료 기준

- [ ] FREE 사용자: Library 1개, 500MB, AI 불가
- [ ] BASIC 사용자: Library 무제한, 5GB, AI 불가
- [ ] PREMIUM 사용자: Library 무제한, 10GB, AI 가능
- [ ] 결제 성공 시 구독 자동 생성/업그레이드
- [ ] 용량 초과 시 업로드 차단
- [ ] AI 엔드포인트 Premium 전용
- [ ] 프론트엔드에서 플랜 업그레이드 가능
