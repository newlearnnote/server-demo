# NewLearnNote API Server Develop Guide

버전은 [package.json](./package.json)을 참고

## 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 데이터베이스 설정

**개발 환경(.env.development 사용):**
```bash
npm run prisma:merge # prisma 자동 통합

npm run prisma:dev:generate # 자동으로 스키마 병합 후 generate
npm run prisma:dev:push
```

**운영 환경(.env.production 사용):**
```bash
npm run prisma:merge # prisma 자동 통합

npm run prisma:prod:generate # 자동으로 스키마 병합 후 generate
npm run prisma:prod:push
```

### 3. 애플리케이션 실행

```bash
# 개발 환경 (watch 모드, .env.development 사용)
npm run start:dev

# 프로덕션 환경 (.env.production 사용)
npm run start

# 테스트 환경 (.env.test 사용)
npm run start:test
```