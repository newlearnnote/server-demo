# Cloud Infrastructure

> Google Cloud Platform 클라우드 인프라 및 배포 전략

## Table of Contents
- [1. 개요](#1-개요)
- [2. 배포 아키텍처](#2-배포-아키텍처)
- [3. Docker 컨테이너화](#3-docker-컨테이너화)
- [4. Cloud Run 배포](#4-cloud-run-배포)
- [5. 환경 구성](#5-환경-구성)

---

## 1. 개요

NewLearnNote는 **Google Cloud Platform (GCP)**을 활용하여 서버리스 아키텍처로 배포됩니다.

### 1.1 GCP 선택 이유

| 장점 | 설명 |
|------|------|
| **서버리스** | Cloud Run으로 인프라 관리 불필요 |
| **Auto-scaling** | 트래픽에 따른 자동 확장 |
| **비용 효율** | Pay-as-you-go (사용한 만큼 지불) |
| **통합 서비스** | GCS, Cloud SQL, Memorystore 등 |
| **Zero-downtime** | Blue/Green 배포 지원 |

---

## 2. 배포 아키텍처

### 2.1 전체 인프라

```mermaid
graph TB
    subgraph "Client"
        USER[End Users]
    end

    subgraph "Google Cloud Platform"
        subgraph "Cloud Run"
            NEST_CR[NestJS Container<br/>Auto-scaling]
            FAST_CR[FastAPI Container<br/>Auto-scaling]
        end

        subgraph "Cloud SQL"
            POSTGRES[(PostgreSQL<br/>Managed DB)]
        end

        subgraph "Cloud Storage"
            GCS[GCS Buckets<br/>- user-documents<br/>- user-avatar]
        end
    end

    USER -->|HTTPS| NEST_CR
    NEST_CR -->|Internal HTTP| FAST_CR
    NEST_CR --> POSTGRES
    NEST_CR --> GCS
    FAST_CR --> POSTGRES
    FAST_CR --> GCS

    style NEST_CR fill:#e0234e,color:#fff
    style FAST_CR fill:#009688,color:#fff
```

### 2.2 Cloud Run 특징

**서버리스 컨테이너:**
- ✅ **완전 관리형**: 서버 관리 불필요
- ✅ **자동 확장**: 0 → N 인스턴스
- ✅ **트래픽 기반**: 요청 수에 따라 확장
- ✅ **Cold Start**: 첫 요청 시 약간 지연 (1-2초)

**가격 모델:**
```
요금 = (CPU 시간 × CPU 가격) + (메모리 사용량 × 메모리 가격) + (요청 수 × 요청 가격)

예시:
- CPU: 1 vCPU
- 메모리: 512MB
- 요청: 100,000회/월
→ 월 ~$5-10
```

---

## 3. Docker 컨테이너화

### 3.1 NestJS Dockerfile

```dockerfile
# server-demo/api/Dockerfile

# Build stage
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build application
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy built files from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package*.json ./

# Expose port
EXPOSE 8000

# Set environment
ENV NODE_ENV=production

# Run application
CMD ["node", "dist/main"]
```

**Multi-stage Build 이점:**
- ✅ 최종 이미지 크기 감소 (50-70% 절감)
- ✅ 빌드 의존성 제외
- ✅ 보안 강화 (소스 코드 미포함)

### 3.2 FastAPI Dockerfile

```dockerfile
# server-demo/ai/Dockerfile

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create ChromaDB directory
RUN mkdir -p /app/chroma

# Expose port
EXPOSE 8001

# Set environment
ENV PYTHONUNBUFFERED=1

# Run application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### 3.3 .dockerignore

```
# server-demo/api/.dockerignore
node_modules
dist
*.log
.env*
.git
.vscode
test
coverage

# server-demo/ai/.dockerignore
__pycache__
*.pyc
.env*
.git
.vscode
venv
.venv
chroma
```

---

## 4. Cloud Run 배포

### 4.1 NestJS 배포

**빌드 및 푸시:**
```bash
# 1. Docker 이미지 빌드
cd server-demo/api
docker build -t gcr.io/newlearnnote/nestjs-api:latest .

# 2. Container Registry에 푸시
docker push gcr.io/newlearnnote/nestjs-api:latest

# 3. Cloud Run 배포
gcloud run deploy nestjs-api \
  --image gcr.io/newlearnnote/nestjs-api:latest \
  --platform managed \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --port 8000 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "DATABASE_URL=postgresql://...,NODE_ENV=production"
```

### 4.2 FastAPI 배포

```bash
# 1. Docker 이미지 빌드
cd server-demo/ai
docker build -t gcr.io/newlearnnote/fastapi-ai:latest .

# 2. Container Registry에 푸시
docker push gcr.io/newlearnnote/fastapi-ai:latest

# 3. Cloud Run 배포
gcloud run deploy fastapi-ai \
  --image gcr.io/newlearnnote/fastapi-ai:latest \
  --platform managed \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --port 8001 \
  --memory 1Gi \
  --cpu 2 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "DATABASE_URL=postgresql://...,OPENAI_API_KEY=..."
```

### 4.3 Cloud Run 설정

**Auto-scaling:**
```yaml
# cloud-run-config.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: nestjs-api
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"  # 최소 인스턴스
        autoscaling.knative.dev/maxScale: "10"  # 최대 인스턴스
        autoscaling.knative.dev/target: "80"  # 동시 요청 수
    spec:
      containers:
      - image: gcr.io/newlearnnote/nestjs-api:latest
        resources:
          limits:
            cpu: "1"
            memory: "512Mi"
        ports:
        - containerPort: 8000
```

---

## 5. 환경 구성

### 5.1 환경 변수 관리

**Secret Manager 사용:**
```bash
# Secret 생성
gcloud secrets create database-url \
  --data-file=- <<< "postgresql://user:password@host/db"

# Cloud Run에 Secret 마운트
gcloud run deploy nestjs-api \
  --update-secrets DATABASE_URL=database-url:latest
```

**환경별 설정:**
```
Development:
- .env.development
- Local PostgreSQL
- Local ChromaDB

Production:
- Cloud Run Environment Variables
- Cloud SQL (PostgreSQL)
- Persistent Disk (ChromaDB)
```

### 5.2 Cloud SQL 연결

**Unix Socket 연결:**
```typescript
// server-demo/api/prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// DATABASE_URL 형식:
// postgresql://user:password@/db?host=/cloudsql/PROJECT:REGION:INSTANCE
```

**Cloud Run에서 Cloud SQL 연결:**
```bash
gcloud run deploy nestjs-api \
  --add-cloudsql-instances PROJECT:REGION:INSTANCE
```

### 5.3 GCS 연결

**Service Account 키:**
```bash
# 1. Service Account 생성
gcloud iam service-accounts create newlearnnote-sa

# 2. Storage 권한 부여
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:newlearnnote-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# 3. 키 파일 생성
gcloud iam service-accounts keys create key.json \
  --iam-account=newlearnnote-sa@PROJECT_ID.iam.gserviceaccount.com

# 4. Cloud Run에 마운트
gcloud run deploy nestjs-api \
  --set-env-vars GOOGLE_APPLICATION_CREDENTIALS=/secrets/key.json
```

---

## 6. CI/CD (향후 구현)

### 6.1 GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]

jobs:
  deploy-nestjs:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - id: auth
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Build and Push Docker image
        run: |
          docker build -t gcr.io/${{ secrets.GCP_PROJECT }}/nestjs-api:${{ github.sha }} ./server-demo/api
          docker push gcr.io/${{ secrets.GCP_PROJECT }}/nestjs-api:${{ github.sha }}

      - name: Deploy to Cloud Run
        uses: google-github-actions/deploy-cloudrun@v1
        with:
          service: nestjs-api
          image: gcr.io/${{ secrets.GCP_PROJECT }}/nestjs-api:${{ github.sha }}
          region: asia-northeast3
```

---

## 7. 모니터링 (향후 구현)

### 7.1 Cloud Logging

**로그 수집:**
```typescript
// NestJS Logger
import { Logger } from '@nestjs/common';

const logger = new Logger('MyService');
logger.log('Information message');
logger.error('Error message', trace);
```

**로그 조회:**
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=nestjs-api" \
  --limit 50 \
  --format json
```

### 7.2 Cloud Monitoring

**메트릭:**
- Request count (요청 수)
- Request latency (응답 시간)
- Instance count (인스턴스 수)
- CPU utilization (CPU 사용률)
- Memory utilization (메모리 사용률)

---

## 8. 비용 최적화

### 8.1 Cold Start 최소화

**최소 인스턴스 설정:**
```bash
# 최소 1개 인스턴스 유지 (Cold Start 방지)
gcloud run deploy nestjs-api \
  --min-instances 1
```

**비용:**
- 최소 인스턴스 0개: 무료 (Cold Start 발생)
- 최소 인스턴스 1개: 월 ~$10 (Cold Start 없음)

### 8.2 리소스 최적화

**적절한 리소스 할당:**
```
NestJS:
- CPU: 1 vCPU
- Memory: 512Mi

FastAPI (AI 처리):
- CPU: 2 vCPU
- Memory: 1Gi (임베딩 생성 시 메모리 필요)
```

---

## 참고 자료

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Docker Documentation](https://docs.docker.com/)
- [gcloud CLI](https://cloud.google.com/sdk/gcloud)
- [Cloud SQL for PostgreSQL](https://cloud.google.com/sql/docs/postgres)
