# 멀티 결제 시스템 가이드

## 개요

NewLearnNote 서버의 결제 시스템은 세 가지 주요 결제 제공업체를 지원합니다:

- **토스페이먼츠**: 한국 내 결제 (신용카드, 가상계좌, 정기결제)
- **네이버페이**: 네이버 생태계 결제 (간편결제, 정기결제)
- **PayPal**: 글로벌 결제 (다중 통화, 구독 서비스)

## 프로젝트 구조

```
src/billing/payment/
├── payment.module.ts           # 통합 결제 모듈
├── payment.controller.ts       # 통합 결제 API 컨트롤러
├── dto/
│   └── payment.dto.ts          # 공통 결제 DTO 정의
├── enums/
│   └── payment.enum.ts         # 결제 관련 열거형
├── interfaces/
│   └── payment.interface.ts    # 공통 인터페이스
├── paypal/
│   └── paypal.service.ts       # PayPal 결제 서비스
├── naverpay/
│   └── naverpay.service.ts     # 네이버페이 결제 서비스
└── tosspayments/
    └── tosspayments.service.ts # 토스페이먼츠 결제 서비스
```

## 환경 변수 설정

### `.env` 파일에 다음 값들을 추가하세요:

이 부분은 서버 관리자가 API 받아와서 추가해야할 키 들입니다.

```bash
# 토스페이먼츠 설정
TOSS_SECRET_KEY=test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R

# 네이버페이 설정
NAVER_PAY_CLIENT_ID=your_naver_pay_client_id
NAVER_PAY_CLIENT_SECRET=your_naver_pay_client_secret
NAVER_PAY_ENVIRONMENT=development  # development | production

# PayPal 설정
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_ENVIRONMENT=sandbox  # sandbox | production
```

## API 사용 가이드

### 1. 결제 생성

**Endpoint:** `POST /payment/create`

```typescript
// 요청 예시
const createPayment = {
  provider: "TOSS_PAYMENTS", // "NAVER_PAY" | "PAYPAL"
  amount: 10000,
  currency: "KRW",
  orderId: "order_123456",
  productName: "프리미엄 구독 서비스",
  paymentMethod: "CREDIT_CARD",
  paymentType: "ONE_TIME",
  customerId: "customer_123",
  successUrl: "https://example.com/payment/success",
  failUrl: "https://example.com/payment/fail"
};

// 응답 예시 (토스페이먼츠)
{
  "provider": "TOSS_PAYMENTS",
  "orderId": "order_123456",
  "amount": 10000,
  "productName": "프리미엄 구독 서비스",
  "message": "토스페이먼츠 결제창을 호출하고 결제 완료 후 confirm 엔드포인트를 호출해주세요."
}

// 응답 예시 (PayPal)
{
  "provider": "PAYPAL",
  "orderId": "PAYPAL_ORDER_123",
  "paymentUrl": "https://www.sandbox.paypal.com/checkoutnow?token=...",
  "data": { ... }
}
```

### 2. 결제 승인

#### 토스페이먼츠 승인

**Endpoint:** `POST /payment/toss/confirm`

```typescript
const confirmPayment = {
  paymentKey: 'payment_key_from_toss',
  orderId: 'order_123456',
  amount: 10000,
};
```

#### 네이버페이 승인

**Endpoint:** `POST /payment/naver/approve`

```typescript
const approvePayment = {
  paymentId: 'naverpay_payment_id',
};
```

#### PayPal 캡처

**Endpoint:** `POST /payment/paypal/capture`

```typescript
const capturePayment = {
  orderId: 'PAYPAL_ORDER_123',
};
```

### 3. 결제 정보 조회

**Endpoint:** `GET /payment/:provider/:paymentId`

```bash
GET /payment/TOSS_PAYMENTS/payment_key_123
GET /payment/NAVER_PAY/naverpay_payment_123
GET /payment/PAYPAL/PAYPAL_ORDER_123
```

### 4. 환불 처리

**Endpoint:** `POST /payment/:provider/refund`

```typescript
const refundRequest = {
  paymentId: 'payment_id_to_refund',
  amount: 5000, // 부분 환불 시 (선택사항)
  reason: 'CUSTOMER_REQUEST',
  reasonDetail: '고객이 서비스 취소를 요청함',
};
```

### 5. 특별 기능

#### 토스페이먼츠 가상계좌 발급

**Endpoint:** `POST /payment/toss/virtual-account`

```typescript
const virtualAccount = {
  orderId: 'order_123456',
  orderName: '프리미엄 구독',
  amount: 10000,
  customerName: '홍길동',
  dueDate: '2023-12-31T23:59:59+09:00',
  bank: '20', // 선택사항
};
```

#### 토스페이먼츠 빌링키 발급

**Endpoint:** `POST /payment/toss/billing-key`

```typescript
const billingKey = {
  customerKey: 'customer_123',
  cardNumber: '1234567812345678',
  cardExpirationYear: '25',
  cardExpirationMonth: '12',
  cardPassword: '12',
  customerBirthday: '901201',
};
```

#### PayPal 구독 플랜 생성

**Endpoint:** `POST /payment/paypal/subscription-plan`

```typescript
const subscriptionPlan = {
  planName: '프리미엄 월간 구독',
  description: '월간 프리미엄 서비스',
  amount: 9.99,
  currency: 'USD',
  interval: 'MONTH',
  intervalCount: 1,
};
```

## 웹훅 처리

각 결제 제공업체는 결제 상태 변경 시 웹훅을 전송합니다:

- **토스페이먼츠**: `POST /payment/webhook/toss`
- **네이버페이**: `POST /payment/webhook/naver`
- **PayPal**: `POST /payment/webhook/paypal`

### 웹훅 보안

실제 운영 환경에서는 다음 보안 조치가 필요합니다:

```typescript
// 토스페이먼츠 웹훅 서명 검증 예시
const crypto = require('crypto');

function verifyTossWebhook(body: string, signature: string) {
  const hash = crypto
    .createHmac('sha256', process.env.TOSS_WEBHOOK_SECRET)
    .update(body)
    .digest('base64');

  return hash === signature;
}
```

## 에러 처리

모든 결제 서비스는 통일된 에러 처리를 제공합니다:

```typescript
try {
  const result = await paymentService.confirmPayment(/* ... */);
} catch (error) {
  if (error instanceof BadRequestException) {
    // 클라이언트 오류 (잘못된 요청)
  } else if (error instanceof InternalServerErrorException) {
    // 서버 내부 오류
  }
}
```

### 주요 에러 코드

| HTTP Status | 설명                              |
| ----------- | --------------------------------- |
| 400         | 잘못된 요청 데이터 또는 결제 실패 |
| 401         | API 키 인증 실패                  |
| 404         | 결제 정보를 찾을 수 없음          |
| 500         | 서버 내부 오류                    |

## 테스트 가이드

### 1. 개발 환경 설정

각 결제 제공업체의 테스트 환경을 사용하세요:

- **토스페이먼츠**: 테스트 API 키 사용
- **네이버페이**: 개발자 센터에서 발급받은 테스트 키
- **PayPal**: Sandbox 환경 사용

### 2. 테스트 카드 번호

#### 토스페이먼츠 테스트 카드

- 정상 승인: `4300000000000000`
- 한도 초과: `4000000000000002`
- 잔액 부족: `4000000000000119`

### 3. 단위 테스트 예시

```typescript
describe('PaymentController', () => {
  let controller: PaymentController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [PaypalService, NaverpayService, TosspaymentsService],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
  });

  it('should create payment successfully', async () => {
    const createPaymentDto = {
      provider: PaymentProvider.TOSS_PAYMENTS,
      amount: 10000,
      currency: Currency.KRW,
      orderId: 'test_order_123',
      productName: '테스트 상품',
      paymentMethod: PaymentMethod.CREDIT_CARD,
      paymentType: PaymentType.ONE_TIME,
      customerId: 'test_customer',
    };

    const result = await controller.createPayment(createPaymentDto);

    expect(result.provider).toBe(PaymentProvider.TOSS_PAYMENTS);
    expect(result.orderId).toBe('test_order_123');
  });
});
```

## 프로덕션 배포

### 1. 보안 체크리스트

- [ ] 모든 API 키가 환경 변수로 관리되고 있는가?
- [ ] 웹훅 엔드포인트에 서명 검증이 구현되어 있는가?
- [ ] HTTPS가 활성화되어 있는가?
- [ ] 결제 데이터가 암호화되어 저장되는가?
- [ ] 로그에 민감한 정보가 포함되지 않는가?

### 2. 모니터링

```typescript
// 결제 성공률 모니터링
@Injectable()
export class PaymentMetricsService {
  private readonly logger = new Logger(PaymentMetricsService.name);

  trackPaymentSuccess(provider: PaymentProvider, amount: number) {
    // 메트릭 수집 로직
    this.logger.log(`Payment successful: ${provider}, Amount: ${amount}`);
  }

  trackPaymentFailure(provider: PaymentProvider, error: string) {
    // 에러 메트릭 수집
    this.logger.error(`Payment failed: ${provider}, Error: ${error}`);
  }
}
```

### 3. 데이터베이스 연동

실제 운영 환경에서는 Prisma 등의 ORM을 사용하여 결제 데이터를 관리하세요:

```prisma
// schema.prisma 예시
// 이거 ERD 목록으로 할지 아니면 아래 처럼 추가할지 의논
model Payment {
  id          String   @id @default(cuid())
  provider    String   // PaymentProvider enum
  orderId     String   @unique
  amount      Int
  currency    String
  status      String   // PaymentStatus enum
  customerId  String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("payments")
}
```

## 문제 해결 (Troubleshooting)

### 자주 발생하는 문제들

1. **토스페이먼츠 결제 승인 실패**
   - 결제 키와 주문 ID 일치 확인
   - 결제 금액 정확성 확인
   - API 키 유효성 검증

2. **네이버페이 타임스탬프 오류**
   - 서버 시간과 네이버 서버 시간 동기화 확인
   - 타임스탬프 형식 확인

3. **PayPal 토큰 만료**
   - 토큰 자동 갱신 로직 확인
   - 캐시 설정 점검

### 로그 분석

```bash
# 결제 관련 로그 필터링
grep "Payment" /var/log/application.log | tail -100

# 특정 결제 제공업체 로그
grep "TossPayments\|NaverPay\|PayPal" /var/log/application.log
```

## 추가 리소스

- [토스페이먼츠 개발자 문서](https://docs.tosspayments.com/)
- [네이버페이 개발자 가이드](https://developer.pay.naver.com/docs)
- [PayPal Developer Documentation](https://developer.paypal.com/docs/)

## 업데이트 로그

- **v1.0.0** (2024-11-12): 멀티 결제 시스템 초기 버전 완성
  - 토스페이먼츠, 네이버페이, PayPal 통합
  - 통합 API 컨트롤러 구현
  - 공통 DTO 및 인터페이스 정의
  - 웹훅 처리 기본 구조 완성

---

**참고**: 이 문서는 개발 가이드입니다. 실제 운영 환경에서는 각 결제 제공업체의 최신 API 문서를 참조하여 구현해주세요.
