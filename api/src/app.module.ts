import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { UserModule } from './account/user/user.module';
import { LoggingMiddleware } from './common/middleware/logging.middleware';
import { SecurityMiddleware } from './common/middleware/security.middleware';
import { AuthModule } from './account/auth/auth.module';
import { NoteModule } from './social/note/note.module';
import { NoteNetworkModule } from './social/note-network/note-network.module';
import { NoteTagModule } from './social/note-tag/note-tag.module';
import { TagModule } from './social/tag/tag.module';
import { SubscriptionModule } from './billing/subscription/subscription.module';
import { PaymentModule } from './billing/payment/payment.module';
import { LibraryModule } from './library/library.module';
import { FileModule } from './common/module/file/file.module';
import { StorageModule } from './common/module/storage/storage.module';
import { NoteBookmarkModule } from './social/note-bookmark/note-bookmark.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? '.env.production'
          : process.env.NODE_ENV === 'demo'
            ? '.env.demo.production'
            : process.env.NODE_ENV === 'test'
              ? '.env.test'
              : '.env.development',
    }),
    PrismaModule,
    UserModule,
    AuthModule,
    NoteModule,
    NoteNetworkModule,
    NoteTagModule,
    TagModule,
    SubscriptionModule,
    PaymentModule,
    LibraryModule,
    FileModule,
    StorageModule,
    NoteBookmarkModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 모든 라우트에 미들웨어 적용
    consumer.apply(SecurityMiddleware, LoggingMiddleware).forRoutes('*path');
  }
}
