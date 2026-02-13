import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Soft delete helper methods
  async softDelete(model: any, where: any): Promise<any> {
    return await model.update({
      where,
      data: {
        deletedAt: new Date(),
      },
    });
  }

  // Find many excluding soft deleted
  async findManyActive(model: any, args: any = {}): Promise<any> {
    return await model.findMany({
      ...args,
      where: {
        ...args.where,
        deletedAt: null,
      },
    });
  }

  // Find unique excluding soft deleted
  async findUniqueActive(model: any, args: any): Promise<any> {
    return await model.findFirst({
      ...args,
      where: {
        ...args.where,
        deletedAt: null,
      },
    });
  }
}
