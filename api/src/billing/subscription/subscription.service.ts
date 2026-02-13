import { Injectable, NotFoundException } from '@nestjs/common';
import { Subscription, SubscriptionPlan } from '@prisma/client';
import { SubscriptionRepository } from './subscription.repository';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
  ) {}

  /**
   * 현재 활성 구독 조회
   */
  async findCurrentSubscription(
    userId: string,
  ): Promise<(Subscription & { plan: SubscriptionPlan }) | null> {
    return this.subscriptionRepository.findActiveSubscriptionWithPlan(userId);
  }

  /**
   * 현재 구독 플랜 조회 (없으면 FREE)
   */
  async getCurrentPlan(userId: string): Promise<SubscriptionPlan> {
    const subscription = await this.findCurrentSubscription(userId);

    if (subscription) {
      return subscription.plan;
    }

    // 구독이 없으면 FREE 플랜 반환
    const freePlan = await this.subscriptionRepository.findPlanByName('FREE');

    if (!freePlan) {
      throw new NotFoundException('FREE plan not found. Please run seed.');
    }

    return freePlan;
  }

  /**
   * FREE 플랜 구독 생성 (회원가입 시 자동 호출)
   */
  async createFreeSubscription(userId: string): Promise<Subscription> {
    const freePlan = await this.subscriptionRepository.getPlanByName('FREE');

    return this.subscriptionRepository.createSubscription(
      userId,
      freePlan.id,
      new Date(),
      null, // FREE는 만료 없음
    );
  }

  /**
   * AI 기능 사용 가능 여부 확인
   */
  async hasAiAccess(userId: string): Promise<boolean> {
    const plan = await this.getCurrentPlan(userId);
    const aiFeatures = plan.aiFeatures as {
      chat?: boolean;
      documentAnalysis?: boolean;
    };
    return (
      aiFeatures?.chat === true || aiFeatures?.documentAnalysis === true
    );
  }

  /**
   * 저장 용량 제한 조회 (바이트 단위)
   */
  async getStorageLimit(userId: string): Promise<number> {
    const plan = await this.getCurrentPlan(userId);
    return this.parseStorageLimit(plan.storageLimit);
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

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
