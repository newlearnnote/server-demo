# TODO 01: 데이터베이스 스키마 수정

## 목적
플랜별 용량 제한을 추적하기 위한 DB 스키마 수정 및 초기 데이터 구축

## 작업 내용

### 1. Library 모델에 storageUsed 필드 추가

**파일**: `server-demo/api/prisma/schema/service/library.prisma`

**수정 전**:
```prisma
model Library {
    id          String  @id @default(ulid()) @db.VarChar(255)
    name        String  @db.VarChar(255)

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

**수정 후**:
```prisma
model Library {
    id          String  @id @default(ulid()) @db.VarChar(255)
    name        String  @db.VarChar(255)
    storageUsed BigInt  @default(0) @db.BigInt  // 바이트 단위

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

---

### 2. SubscriptionPlan 시드 데이터 생성

**파일**: `server-demo/api/prisma/seed.ts` (신규 생성)

**내용**:
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding subscription plans...');

  // FREE 플랜
  await prisma.subscriptionPlan.upsert({
    where: { name: 'FREE' },
    update: {},
    create: {
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
  });

  // BASIC 플랜
  await prisma.subscriptionPlan.upsert({
    where: { name: 'BASIC' },
    update: {},
    create: {
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
  });

  // PREMIUM 플랜
  await prisma.subscriptionPlan.upsert({
    where: { name: 'PREMIUM' },
    update: {},
    create: {
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
  });

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

---

### 3. package.json에 seed 스크립트 추가

**파일**: `server-demo/api/package.json`

**추가**:
```json
{
  "scripts": {
    "prisma:seed": "ts-node prisma/seed.ts"
  }
}
```

---

## 실행 순서

1. Library 모델 수정
2. Prisma migration 생성
   ```bash
   cd server-demo/api
   npx prisma migrate dev --name add_storage_used_to_library
   ```
3. seed.ts 파일 생성
4. package.json에 스크립트 추가
5. 시드 데이터 실행
   ```bash
   npm run prisma:seed
   ```
6. 결과 확인
   ```bash
   npx prisma studio
   ```

---

## 체크리스트

- [ ] Library 모델에 storageUsed 필드 추가
- [ ] Prisma migration 생성 및 실행
- [ ] prisma/seed.ts 파일 생성
- [ ] SubscriptionPlan 시드 데이터 작성 (FREE, BASIC, PREMIUM)
- [ ] package.json에 seed 스크립트 추가
- [ ] 시드 데이터 실행
- [ ] Prisma Studio로 데이터 확인

---

## 완료 조건

- Library 테이블에 storageUsed 컬럼이 추가되어 있음
- SubscriptionPlan 테이블에 3개의 플랜(FREE, BASIC, PREMIUM)이 존재함
- 각 플랜의 storageLimit와 aiFeatures가 올바르게 설정되어 있음

---

## 다음 단계

02-subscription-service.md로 이동하여 구독 서비스 로직 구현
