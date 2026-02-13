import { PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';

const prisma = new PrismaClient();
const logger = new Logger('PrismaSeeder');

async function main() {
  logger.verbose('Start seeding subscription plans...');

  // FREE 플랜
  const freePlan = await prisma.subscriptionPlan.upsert({
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
  logger.verbose(`FREE plan created: ${freePlan.id}`);

  // BASIC 플랜
  const basicPlan = await prisma.subscriptionPlan.upsert({
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
  logger.verbose(`BASIC plan created: ${basicPlan.id}`);

  // PREMIUM 플랜
  const premiumPlan = await prisma.subscriptionPlan.upsert({
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
  logger.verbose(`PREMIUM plan created: ${premiumPlan.id}`);

  logger.verbose('Seeding completed successfully!');
}

main()
  .catch((e) => {
    logger.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
