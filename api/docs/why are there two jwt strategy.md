# JWT Strategy가 두 개인 이유

**작성일**: 2024년 9월 24일
**주제**: JWT 인증 전략 이중 구조 설계 배경

## 개요

NewLearnNote 프로젝트에서는 두 개의 JWT 전략을 사용합니다:
1. **JwtAuthGuard** - 웹 브라우저용 (쿠키 기반)
2. **JwtDesktopAuthGuard** - 데스크톱 앱용 (Authorization 헤더 기반)

이러한 이중 구조를 채택한 이유와 각각의 특징을 설명합니다.

## 환경별 요구사항 차이

### 웹 브라우저 환경
- **토큰 저장**: HttpOnly 쿠키 (XSS 방지)
- **전송 방식**: 자동 쿠키 전송
- **보안 정책**: sameSite=strict (CSRF 방지)
- **사용자 편의**: 자동 로그인 유지

### 데스크톱 애플리케이션 환경
- **토큰 저장**: 앱 내부 보안 저장소
- **전송 방식**: Authorization Bearer 헤더
- **보안 정책**: 명시적 토큰 관리
- **사용자 편의**: 수동 토큰 관리

## 기술적 구현 차이점

### 1. JwtAuthGuard (웹용)
**파일**: `server/src/account/auth/jwt/jwt.strategy.ts`

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: (req: Request) => {
        // 쿠키에서 토큰 추출
        return req.cookies?.accessToken || null;
      },
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
      passReqToCallback: true,
    });
  }
}
```

**특징**:
- 쿠키에서 토큰 추출 (`req.cookies.accessToken`)
- 자동으로 브라우저가 쿠키 전송
- HttpOnly 쿠키로 XSS 공격 방지
- sameSite strict로 CSRF 공격 방지

### 2. JwtDesktopAuthGuard (데스크톱용)
**파일**: `server/src/account/auth/jwt/jwt-desktop.strategy.ts`

```typescript
@Injectable()
export class JwtDesktopStrategy extends PassportStrategy(JwtStrategy, 'jwt-desktop') {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Authorization 헤더
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
      passReqToCallback: true,
    });
  }
}
```

**특징**:
- Authorization 헤더에서 토큰 추출 (`Authorization: Bearer <token>`)
- 명시적으로 헤더에 토큰 포함 필요
- 앱에서 직접 토큰 관리
- 쿠키 제약이 없는 환경에 적합

## 보안 모델 차이점

### 웹 브라우저 보안 모델
```
사용자 → 브라우저 → HttpOnly 쿠키 → 서버
       ↑                    ↓
   자동 전송           XSS 방지
```

**장점**:
- XSS 공격으로부터 토큰 보호
- CSRF 공격 방지 (sameSite strict)
- 사용자가 토큰을 직접 다룰 필요 없음

**단점**:
- 쿠키 정책에 따른 제약
- 크로스 도메인 요청 시 복잡성

### 데스크톱 애플리케이션 보안 모델
```
사용자 → 데스크톱 앱 → Authorization 헤더 → 서버
       ↑                         ↓
   명시적 관리              직접 토큰 전송
```

**장점**:
- 완전한 토큰 제어
- 크로스 플랫폼 호환성
- 네트워크 요청 완전 제어

**단점**:
- 토큰 보안 책임이 앱에 있음
- XSS 공격에 취약할 수 있음 (웹뷰 사용 시)

## API 엔드포인트 분리

### 웹용 API
- `POST /auth/refresh` - 쿠키 기반 토큰 갱신
- `POST /auth/logout` - 쿠키 기반 로그아웃

```typescript
// 쿠키에서 토큰 추출
const refreshToken = req.cookies?.refreshToken;
const accessToken = req.cookies?.accessToken;
```

### 데스크톱용 API
- `POST /auth/refresh/desktop` - 바디 기반 토큰 갱신
- `POST /auth/logout/desktop` - 헤더 기반 로그아웃

```typescript
// 바디와 헤더에서 토큰 추출
const refreshToken = body.refreshToken;
const accessToken = authHeader?.replace('Bearer ', '');
```

## 사용 시나리오 비교

| 기능 | 웹 브라우저 | 데스크톱 앱 |
|------|-------------|-------------|
| 로그인 | Google OAuth 콜백 → 쿠키 설정 | Google OAuth 콜백 → JSON 응답 |
| 토큰 저장 | HttpOnly 쿠키 | 앱 내부 저장소 |
| API 요청 | 자동 쿠키 전송 | Authorization 헤더 추가 |
| 토큰 갱신 | 쿠키 기반 `/refresh` | 바디 기반 `/refresh/desktop` |
| 로그아웃 | 쿠키 기반 `/logout` | 헤더 기반 `/logout/desktop` |

## 보안 고려사항

### 공통 보안 기능
- **JTI 기반 블랙리스트**: 두 전략 모두 토큰 무효화 확인
- **토큰 회전**: Refresh Token 사용 시 새 토큰 발급
- **Rate Limiting**: 토큰 갱신 API에 속도 제한

### 웹 브라우저 추가 보안
```typescript
// HttpOnly 쿠키 설정
res.cookie('accessToken', accessToken, {
  httpOnly: true,           // XSS 방지
  secure: NODE_ENV === 'production',  // HTTPS 전용
  sameSite: 'strict',       // CSRF 방지
  maxAge: 15 * 60 * 1000,   // 15분
});
```

### 데스크톱 추가 보안
```typescript
// JTI 블랙리스트 확인 (Strategy에서)
const isBlacklisted = await this.authService.isTokenBlacklisted(payload.jti);
if (isBlacklisted) {
  throw new UnauthorizedException('Token has been revoked');
}
```

## 설계 원칙

### 1. 환경별 최적화
각 플랫폼의 특성에 맞는 인증 방식 제공

### 2. 보안 우선
각 환경에서 최적의 보안 모델 적용

### 3. 사용자 경험
각 플랫폼 사용자에게 자연스러운 인증 흐름 제공

### 4. 확장성
향후 모바일 앱 등 추가 플랫폼 지원 가능한 구조

## 향후 확장 가능성

### 모바일 앱 지원
```typescript
// 미래의 모바일 전략 예시
@Injectable()
export class JwtMobileStrategy extends PassportStrategy(JwtStrategy, 'jwt-mobile') {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // 모바일 특화 설정
    });
  }
}
```

### API 키 인증
```typescript
// 서버 간 통신용 전략 예시
@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  // API 키 기반 인증
}
```

## 아키텍처 다이어그램

```
┌─────────────────┐    ┌─────────────────┐
│   웹 브라우저    │    │   데스크톱 앱    │
│                 │    │                 │
│ HttpOnly Cookie │    │ Authorization   │
│                 │    │ Bearer Header   │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
          ▼                      ▼
    ┌─────────────────────────────────────┐
    │         NestJS 서버                 │
    │                                     │
    │  JwtAuthGuard  │  JwtDesktopGuard   │
    │  (쿠키 기반)    │  (헤더 기반)       │
    │                │                    │
    └─────────┬───────┴───────┬───────────┘
              │               │
              ▼               ▼
         ┌─────────────────────────┐
         │    공통 JWT 검증        │
         │  - JTI 블랙리스트 확인   │
         │  - 토큰 유효성 검증      │
         │  - 사용자 정보 조회      │
         └─────────────────────────┘
```

## 결론

두 개의 JWT 전략을 사용하는 이유는 **웹 브라우저와 데스크톱 애플리케이션의 근본적인 차이점** 때문입니다:

1. **보안 모델 차이**: 쿠키 vs Authorization 헤더
2. **사용자 경험 차이**: 자동 vs 수동 토큰 관리
3. **플랫폼 제약 차이**: 브라우저 정책 vs 앱 자유도

이러한 이중 구조를 통해 각 환경에서 최적의 보안과 사용자 경험을 제공할 수 있습니다.

---

**작성 완료**: JWT 전략 이중 구조 설계 배경 문서화 완료
**목적**: 개발팀의 아키텍처 이해도 향상 및 유지보수 가이드 제공
