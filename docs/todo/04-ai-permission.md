# TODO 04: AI 권한 관리 시스템

## 목적
Premium 플랜 사용자만 AI 어시스턴스 기능을 사용할 수 있도록 권한 관리 시스템 구현

## 작업 내용

### 1. PremiumGuard 생성

**파일**: `server-demo/api/src/common/guards/premium.guard.ts` (신규 생성)

**내용**:

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
      throw new ForbiddenException('Authentication required.');
    }

    const hasAccess = await this.subscriptionService.hasAiAccess(userId);

    if (!hasAccess) {
      const plan = await this.subscriptionService.getCurrentPlan(userId);
      throw new ForbiddenException(
        `AI assistance is only available for Premium plan. ` +
        `Current plan: ${plan.name}. Please upgrade your plan.`
      );
    }

    return true;
  }
}
```

---

### 2. AiClientService 생성

**파일**: `server-demo/api/src/common/services/ai-client.service.ts` (신규 생성)

**내용**:

```typescript
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

@Injectable()
export class AiClientService {
  private readonly axiosInstance: AxiosInstance;
  private readonly aiServerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.aiServerUrl = this.configService.get<string>('AI_SERVER_URL') || 'http://localhost:8001';

    this.axiosInstance = axios.create({
      baseURL: this.aiServerUrl,
      timeout: 60000, // AI 처리는 시간이 걸릴 수 있으므로 60초
    });
  }

  /**
   * 문서 업로드
   */
  async uploadDocument(
    userId: string,
    file: Express.Multer.File,
  ): Promise<any> {
    try {
      const formData = new FormData();
      const blob = new Blob([file.buffer], { type: file.mimetype });
      formData.append('file', blob, file.originalname);

      const response = await this.axiosInstance.post('/documents/upload', formData, {
        headers: {
          'X-User-Id': userId,
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error) {
      this.handleError(error, 'Document upload failed');
    }
  }

  /**
   * 채팅 메시지 전송
   */
  async sendMessage(
    userId: string,
    chatId: string,
    message: string,
  ): Promise<any> {
    try {
      const response = await this.axiosInstance.post('/messages', {
        chat_id: chatId,
        message,
      }, {
        headers: {
          'X-User-Id': userId,
        },
      });

      return response.data;
    } catch (error) {
      this.handleError(error, 'Send message failed');
    }
  }

  /**
   * 채팅 메시지 목록 조회
   */
  async getMessages(
    userId: string,
    chatId: string,
  ): Promise<any> {
    try {
      const response = await this.axiosInstance.get(`/chats/${chatId}/messages`, {
        headers: {
          'X-User-Id': userId,
        },
      });

      return response.data;
    } catch (error) {
      this.handleError(error, 'Get messages failed');
    }
  }

  /**
   * 채팅 목록 조회
   */
  async getChats(userId: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get('/chats', {
        headers: {
          'X-User-Id': userId,
        },
      });

      return response.data;
    } catch (error) {
      this.handleError(error, 'Get chats failed');
    }
  }

  /**
   * 채팅 생성
   */
  async createChat(
    userId: string,
    documentId: string,
    title?: string,
  ): Promise<any> {
    try {
      const response = await this.axiosInstance.post('/chats', {
        document_id: documentId,
        title,
      }, {
        headers: {
          'X-User-Id': userId,
        },
      });

      return response.data;
    } catch (error) {
      this.handleError(error, 'Create chat failed');
    }
  }

  /**
   * 에러 핸들링
   */
  private handleError(error: any, message: string): never {
    console.error(`[AiClientService] ${message}:`, error.response?.data || error.message);

    if (error.response) {
      throw new InternalServerErrorException(
        `AI Server Error: ${error.response.data?.detail || message}`
      );
    }

    throw new InternalServerErrorException(`${message}: ${error.message}`);
  }
}
```

---

### 3. AiController 생성

**파일**: `server-demo/api/src/ai/ai.controller.ts` (신규 생성)

**내용**:

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UploadedFile,
  UseGuards,
  Request,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PremiumGuard } from '@/common/guards/premium.guard';
import { AiClientService } from '@/common/services/ai-client.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('AI Assistant')
@Controller('ai')
@UseGuards(JwtAuthGuard, PremiumGuard)
@ApiBearerAuth()
export class AiController {
  constructor(private readonly aiClient: AiClientService) {}

  @Post('documents/upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '문서 업로드 (Premium 전용)' })
  async uploadDocument(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.aiClient.uploadDocument(req.user.id, file);
  }

  @Post('chats')
  @ApiOperation({ summary: '채팅 생성 (Premium 전용)' })
  async createChat(
    @Request() req,
    @Body('documentId') documentId: string,
    @Body('title') title?: string,
  ) {
    return this.aiClient.createChat(req.user.id, documentId, title);
  }

  @Get('chats')
  @ApiOperation({ summary: '채팅 목록 조회 (Premium 전용)' })
  async getChats(@Request() req) {
    return this.aiClient.getChats(req.user.id);
  }

  @Post('chats/:chatId/messages')
  @ApiOperation({ summary: '메시지 전송 (Premium 전용)' })
  async sendMessage(
    @Request() req,
    @Param('chatId') chatId: string,
    @Body('message') message: string,
  ) {
    return this.aiClient.sendMessage(req.user.id, chatId, message);
  }

  @Get('chats/:chatId/messages')
  @ApiOperation({ summary: '메시지 목록 조회 (Premium 전용)' })
  async getMessages(
    @Request() req,
    @Param('chatId') chatId: string,
  ) {
    return this.aiClient.getMessages(req.user.id, chatId);
  }
}
```

---

### 4. AiModule 생성

**파일**: `server-demo/api/src/ai/ai.module.ts` (신규 생성)

**내용**:

```typescript
import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiClientService } from '@/common/services/ai-client.service';
import { SubscriptionModule } from '@/billing/subscription/subscription.module';
import { PremiumGuard } from '@/common/guards/premium.guard';

@Module({
  imports: [SubscriptionModule],
  controllers: [AiController],
  providers: [AiClientService, PremiumGuard],
  exports: [AiClientService],
})
export class AiModule {}
```

---

### 5. AppModule에 AiModule 등록

**파일**: `server-demo/api/src/app.module.ts`

**수정**:

```typescript
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({...}),
    PrismaModule,
    UserModule,
    AuthModule,
    NoteModule,
    NoteNetworkModule,
    NoteTagModule,
    TagModule,
    SubscriptionModule,
    PaymentModule,
    LibraryModule,
    FileModule,
    StorageModule,
    NoteBookmarkModule,
    AdminModule,
    AiModule, // 추가
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware, LoggingMiddleware).forRoutes('*');
  }
}
```

---

### 6. 환경 변수 추가

**파일**: `server-demo/api/.env.development`

**추가**:

```env
# AI Server
AI_SERVER_URL=http://localhost:8001
```

---

## 체크리스트

- [ ] PremiumGuard 생성
- [ ] PremiumGuard에서 hasAiAccess 확인 로직 구현
- [ ] AiClientService 생성
- [ ] AiClientService에 uploadDocument 메서드 구현
- [ ] AiClientService에 sendMessage 메서드 구현
- [ ] AiClientService에 getMessages 메서드 구현
- [ ] AiClientService에 getChats 메서드 구현
- [ ] AiClientService에 createChat 메서드 구현
- [ ] AiController 생성
- [ ] AiController에 모든 엔드포인트 JwtAuthGuard, PremiumGuard 적용
- [ ] AiModule 생성 및 AppModule에 등록
- [ ] .env.development에 AI_SERVER_URL 추가
- [ ] Swagger 문서화 (ApiTags, ApiOperation)

---

## 테스트 시나리오

### 1. Premium 사용자
- [ ] Premium 플랜 사용자로 로그인
- [ ] POST /api/ai/documents/upload 호출 성공
- [ ] POST /api/ai/chats 호출 성공
- [ ] POST /api/ai/chats/:chatId/messages 호출 성공
- [ ] GET /api/ai/chats/:chatId/messages 호출 성공

### 2. FREE/BASIC 사용자
- [ ] FREE 플랜 사용자로 로그인
- [ ] POST /api/ai/documents/upload 호출 시 403 Forbidden 반환
- [ ] 에러 메시지에 "AI 어시스턴스는 Premium 플랜 전용 기능입니다" 포함
- [ ] 에러 메시지에 현재 플랜 이름 포함

### 3. 미인증 사용자
- [ ] 토큰 없이 AI 엔드포인트 호출 시 401 Unauthorized 반환

---

## 완료 조건

- FREE/BASIC 플랜 사용자는 AI 엔드포인트 접근 시 403 에러 발생
- Premium 플랜 사용자는 모든 AI 엔드포인트 정상 접근
- NestJS에서 FastAPI로 요청 시 X-User-Id 헤더 전달
- Swagger 문서에 "Premium 전용" 표시

---

## 다음 단계

05-fastapi-integration.md로 이동하여 FastAPI 서버 권한 검증 추가
