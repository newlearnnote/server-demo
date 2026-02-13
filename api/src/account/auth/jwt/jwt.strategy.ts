// server/src/auth/jwt/jwt.strategy.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { AuthService } from '../auth.service';

// [디버깅용] 로그가 포함된 추출 함수
const cookieOrHeaderExtractor = (req: Request): string | null => {
  let token: string | null = null;

  // 1. 쿠키 확인 (웹)
  if (req && req.cookies) {
    token = req.cookies['accessToken'] || null;
  }

  // 2. 헤더 확인 (앱)
  // 들어오는 헤더를 무조건 찍어봅니다.
  const authHeader = req.headers['authorization'] as string | undefined;

  if (!token) {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  return token;
};

@Injectable()
export class JwtAuthStrategy extends PassportStrategy(JwtStrategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    super({
      jwtFromRequest: cookieOrHeaderExtractor,
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    jti?: string;
    iat: number;
    exp: number;
  }) {
    if (!payload.jti) {
      throw new UnauthorizedException('Invalid token format - missing JTI');
    }

    const isBlacklisted = await this.authService.isTokenBlacklisted(
      payload.jti,
    );
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    const user = await this.authService.findUserBySub(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }
}
