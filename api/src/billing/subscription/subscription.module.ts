import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRepository } from './subscription.repository';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LibraryModule } from '../../library/library.module';

@Module({
  imports: [PrismaModule, LibraryModule],
  providers: [SubscriptionService, SubscriptionRepository],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
