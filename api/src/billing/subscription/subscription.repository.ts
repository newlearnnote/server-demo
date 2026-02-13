import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Subscription, SubscriptionPlan } from '@prisma/client';

@Injectable()
export class SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 현재 활성 구독 조회 (플랜 포함)
   * @param userId 사용자 ID
   * @returns 활성 구독 또는 null
   */
  async findActiveSubscriptionWithPlan(
    userId: string,
  ): Promise<(Subscription & { plan: SubscriptionPlan }) | null> {
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
   * 플랜명으로 플랜 조회
   * @param name 플랜 이름 (FREE, BASIC, PREMIUM)
   * @returns 플랜 또는 null
   */
  async findPlanByName(name: string): Promise<SubscriptionPlan | null> {
    return this.prisma.subscriptionPlan.findUnique({
      where: { name },
    });
  }

  /**
   * 플랜명으로 플랜 조회 (없으면 예외)
   * @param name 플랜 이름
   * @returns 플랜
   * @throws NotFoundException
   */
  async getPlanByName(name: string): Promise<SubscriptionPlan> {
    const plan = await this.findPlanByName(name);
    if (!plan) {
      throw new Error(`Plan ${name} not found`);
    }
    return plan;
  }

  /**
   * 구독 생성
   * @param userId 사용자 ID
   * @param planId 플랜 ID
   * @param startDate 시작일
   * @param endDate 종료일 (null 가능)
   * @returns 생성된 구독
   */
  async createSubscription(
    userId: string,
    planId: string,
    startDate: Date,
    endDate: Date | null,
  ): Promise<Subscription> {
    return this.prisma.subscription.create({
      data: {
        userId,
        planId,
        status: 'active',
        startDate,
        endDate,
      },
    });
  }
}
