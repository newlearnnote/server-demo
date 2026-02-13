import { Global, Module } from '@nestjs/common';
import { AuthAppController } from './auth-app.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { GoogleStrategy, GoogleDesktopStrategy } from './google.strategy';
import { JwtAuthStrategy } from './jwt/jwt.strategy';
import { UserModule } from '../user/user.module';
import { AuthWebController } from './auth-web.controller';
import { SubscriptionModule } from '../../billing/subscription/subscription.module';

/**
 * AuthModule - 인증 관련 모듈
 * @Global() 데코레이터로 JwtModule을 전역에서 사용 가능하도록 설정
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'your-secret-key',
        signOptions: { expiresIn: '24h' },
      }),
    }),
    PassportModule,
    UserModule,
    SubscriptionModule,
  ],
  controllers: [AuthAppController, AuthWebController],
  providers: [
    AuthService,
    AuthRepository,
    GoogleStrategy,
    GoogleDesktopStrategy,
    JwtAuthStrategy,
  ],
  exports: [AuthService, AuthRepository, JwtModule],
})
export class AuthModule {}
