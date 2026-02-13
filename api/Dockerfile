# 멀티 스테이지 빌드
FROM node:20-alpine AS builder

# 작업 디렉터리 설정
WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# npm 설정 (네트워크 안정성 향상)
RUN npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 300000 \
    && npm config set maxsockets 50

# 모든 의존성 설치 (빌드에 필요한 devDependencies 포함)
RUN npm ci

# 소스 코드 복사
COPY . .

# Prisma 클라이언트 생성
RUN npm run prisma:merge
RUN npx prisma generate --schema=./prisma/schema/schema.prisma

# 애플리케이션 빌드
RUN npm run build

# 프로덕션 의존성만 재설치 (빌드 후)
RUN npm ci --only=production && npm cache clean --force

# 프로덕션 스테이지
FROM node:20-alpine AS production

# 작업 디렉터리 설정
WORKDIR /app

# 필요한 파일들만 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

# 환경 설정 파일 복사
COPY .env.production ./.env.production

# 서비스 계정 키 파일 복사 (선택사항)
COPY service-account-key.json ./service-account-key.json

# Prisma 클라이언트 재생성 (프로덕션 스테이지에서)
RUN npx prisma generate --schema=./prisma/schema/schema.prisma

# 시작 스크립트 생성 (마이그레이션 파일 존재 여부에 따라 자동 선택)
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'echo "Waiting for database to be ready..."' >> /app/start.sh && \
    echo 'sleep 5' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# 마이그레이션 파일이 있으면 migrate deploy, 없으면 db push' >> /app/start.sh && \
    echo 'if [ -d "./prisma/migrations" ] && [ "$(ls -A ./prisma/migrations 2>/dev/null)" ]; then' >> /app/start.sh && \
    echo '  echo "Migration files found. Running prisma migrate deploy..."' >> /app/start.sh && \
    echo '  npx prisma migrate deploy --schema=./prisma/schema/schema.prisma' >> /app/start.sh && \
    echo 'else' >> /app/start.sh && \
    echo '  echo "No migration files found. Running prisma db push..."' >> /app/start.sh && \
    echo '  npx prisma db push --schema=./prisma/schema/schema.prisma --skip-generate' >> /app/start.sh && \
    echo 'fi' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo 'echo "Database setup completed"' >> /app/start.sh && \
    echo 'echo "Starting application..."' >> /app/start.sh && \
    echo 'node dist/main' >> /app/start.sh && \
    chmod +x /app/start.sh

# 포트 노출
EXPOSE 8000

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/api || exit 1

# 애플리케이션 실행
CMD ["/app/start.sh"]