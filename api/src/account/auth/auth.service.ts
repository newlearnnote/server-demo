import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRepository } from './auth.repository';
import {
  GoogleUser,
  CreateGoogleUserDto,
  CreateProfileDto,
  AuthResult,
  TokenPair,
  JwtPayload,
} from './auth.dto';
import { User } from '@prisma/client';
import { Response } from 'express';
import { UserService } from '../user/user.service';
import { env } from 'process';
import * as crypto from 'crypto';
import { ResponseUserDto } from '../user/user.dto';
import { SubscriptionService } from '../../billing/subscription/subscription.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  // ===== Google Login =====

  /**
   * Validate Google user and return authentication result.
   * @param googleUser Google user information
   * @returns AuthResult
   */
  async validateGoogleUser(googleUser: GoogleUser): Promise<AuthResult> {
    // oauthId, provider로 사용자 존재 여부 확인
    let user = await this.authRepository.findUserByOauthId(
      googleUser.id,
      'google',
    );

    if (!user) {
      user = await this.authRepository.findUserByEmail(googleUser.email);
      if (user) {
        // 구글 로그인이 아니지만, 이메일이 이미 존재하는 경우(로컬 로그인이 gmail인 경우 등...)
        throw new Error('User Email already exists');
      } else {
        const createUserDto: CreateGoogleUserDto = {
          oauthId: googleUser.id,
          email: googleUser.email,
          // firstName, lastName이 빈 문자열일 수도 있음
          firstName:
            googleUser.firstName && googleUser.firstName.trim() !== ''
              ? googleUser.firstName
              : 'User',
          lastName:
            googleUser.lastName && googleUser.lastName.trim() !== ''
              ? googleUser.lastName
              : Math.floor(100000 + Math.random() * 900000).toString(),
        };

        const createProfileDto: CreateProfileDto = {
          nickname:
            `${googleUser.firstName}${Math.floor(100000 + Math.random() * 900000).toString()}`.toLowerCase(),
          avatarUrl: googleUser.picture || process.env.AVATAR_DEFAULT_URL || '',
        };

        // 최대 5번 반복, 만약 그래도 중복이면, 다시 로그인을 시도해주세요 라는 문구를 남김
        let isExisting: boolean = false;
        for (let i = 0; i < 5; i++) {
          isExisting = await this.userService.isExistingNickname(
            createProfileDto.nickname,
          );
          if (!isExisting) {
            break;
          }
          createProfileDto.nickname = `${createProfileDto.nickname}${Math.floor(
            100000 + Math.random() * 900000,
          )}`;
        }
        if (isExisting) {
          throw new Error('Nickname already exists. Please try again.');
        }

        // 구글 사용자 생성
        user = await this.authRepository.createGoogleUser(
          createUserDto,
          createProfileDto,
        );

        // FREE 플랜 구독 생성
        await this.subscriptionService.createFreeSubscription(user.id);
      }
    }

    if (!user) {
      throw new Error('Failed to create or find user');
    }

    // generate AuthResult
    return this.generateAuthResult(user);
  }

  // ===== Token Management Methods =====

  /**
   * Generate JWT token pair (access + refresh)
   * @param user User information
   * @returns TokenPair containing access and refresh tokens
   */
  generateTokenPair(user: ResponseUserDto): TokenPair {
    // Generate unique JTI for each token
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();

    // Generate access token (15 minutes)
    const accessToken: string = this.jwtService.sign(
      {
        sub: user.id.toString(), // Convert BigInt to string
        email: user.email,
        type: 'access',
        jti: accessJti,
      },
      {
        secret: process.env.JWT_SECRET || 'your-secret-key',
        expiresIn: '15m',
      },
    );

    // Generate refresh token (7 days)
    const refreshToken: string = this.jwtService.sign(
      {
        sub: user.id.toString(), // Convert BigInt to string
        type: 'refresh',
        jti: refreshJti,
      },
      {
        secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
        expiresIn: '7d',
      },
    );

    return { accessToken, refreshToken };
  }

  /**
   * Validate refresh token and generate new token pair (both access and refresh)
   * @param refreshToken Refresh token to validate
   * @param shouldBlacklistOldToken Whether to blacklist the old refresh token (default: true)
   * @returns Result object with success status, new tokens, user, and message
   */
  async refreshTokenPair(
    refreshToken: string,
    shouldBlacklistOldToken: boolean = true,
  ): Promise<{
    success: boolean;
    tokens?: TokenPair;
    user?: ResponseUserDto;
    message?: string;
  }> {
    try {
      // Validate refresh token
      const decodedToken: unknown = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
      });

      // Validate token structure
      if (
        !this.isValidJwtPayload(decodedToken) ||
        decodedToken.type !== 'refresh'
      ) {
        return {
          success: false,
          message: 'Invalid refresh token.',
        };
      }

      // Retrieve user information
      const user = await this.findUserBySub(decodedToken.sub);

      if (!user) {
        return {
          success: false,
          message: 'User not found.',
        };
      }

      // Check if refresh token is blacklisted
      const isBlacklisted = await this.authRepository.isTokenBlacklisted(
        decodedToken.jti,
      );
      if (isBlacklisted) {
        return {
          success: false,
          message: 'Token has been revoked.',
        };
      }

      // Blacklist old refresh token only if requested (to avoid double blacklisting)
      if (shouldBlacklistOldToken) {
        await this.refreshTokenToBlacklist(refreshToken);
      }

      // Generate new token pair
      const newTokens = this.generateTokenPair(user);
      return {
        success: true,
        tokens: newTokens,
        user,
      };
    } catch {
      return {
        success: false,
        message: 'Invalid refresh token.',
      };
    }
  }

  /**
   * JWT token generation helper for initial authentication
   * @param user User information
   * @returns AuthResult containing access token and user info
   */
  private generateAuthResult(user: ResponseUserDto): AuthResult {
    const payload = {
      sub: user.id.toString(), // Convert BigInt to string
      email: user.email,
      type: 'access' as const,
      jti: crypto.randomUUID(),
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user,
    };
  }

  /**
   * Validate JWT payload structure
   * @param token Token payload to validate
   * @returns Boolean indicating if payload is valid
   */
  private isValidJwtPayload(token: unknown): token is JwtPayload {
    if (typeof token !== 'object' || token === null) {
      return false;
    }

    const obj = token as Record<string, unknown>;

    return (
      'sub' in obj &&
      'type' in obj &&
      'jti' in obj &&
      typeof obj.sub === 'string' &&
      typeof obj.jti === 'string' &&
      (obj.type === 'access' || obj.type === 'refresh')
    );
  }

  // ===== Cookie Management Methods =====

  /**
   * Set authentication tokens as HttpOnly cookies
   * @param res Express Response object
   * @param tokens Token pair to set as cookies
   */
  setAuthCookies(res: Response, tokens: TokenPair): void {
    const { accessToken, refreshToken } = tokens;

    // Send access token via HttpOnly cookie (enhanced security)
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    // Send refresh token via HttpOnly cookie (enhanced security)
    if (refreshToken) {
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    }
  }

  /**
   * Clear authentication cookies
   * @param res Express Response object
   */
  clearAuthCookies(res: Response): void {
    // Clear cookies with same options as when they were set
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
  }

  // ===== Desktop Tokens Management =====

  /**
   * Create desktop tokens for the user
   * @param user User information
   * @returns TokenPair (access + refresh)
   */
  async createDesktopTokens(
    user: ResponseUserDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Use the same generateTokenPair method for consistency
    const tokens = this.generateTokenPair(user);

    // return tokens by body (not cookies: desktop app doesn't have httpOnly cookie)
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // ===== Token Blacklist Methods =====

  /**
   * Add access token to blacklist
   * @param accessToken Access token to blacklist
   * @returns Success status
   */
  async accessTokenToBlacklist(accessToken: string): Promise<boolean> {
    try {
      const decoded = this.jwtService.decode(accessToken) as any;

      if (
        !decoded ||
        !decoded.jti ||
        !decoded.exp ||
        decoded.type !== 'access'
      ) {
        return false;
      }

      const expiresAt = new Date(decoded.exp * 1000);
      await this.authRepository.addToBlacklist(decoded.jti, expiresAt);

      return true;
    } catch (error) {
      console.error('Error blacklisting access token:', error);
      return false;
    }
  }

  /**
   * Add refresh token to blacklist
   * @param refreshToken Refresh token to blacklist
   * @returns Success status
   */
  async refreshTokenToBlacklist(refreshToken: string): Promise<boolean> {
    try {
      const decoded = this.jwtService.decode(refreshToken) as any;

      if (
        !decoded ||
        !decoded.jti ||
        !decoded.exp ||
        decoded.type !== 'refresh'
      ) {
        return false;
      }

      const expiresAt = new Date(decoded.exp * 1000);
      await this.authRepository.addToBlacklist(decoded.jti, expiresAt);

      return true;
    } catch (error) {
      console.error('Error blacklisting refresh token:', error);
      return false;
    }
  }

  /**
   * Add both access and refresh tokens to blacklist
   * @param accessToken Access token to blacklist (optional)
   * @param refreshToken Refresh token to blacklist (optional)
   * @returns Object with success status for both tokens
   */
  async tokenPairToBlacklist(
    accessToken?: string,
    refreshToken?: string,
  ): Promise<{ accessSuccess: boolean; refreshSuccess: boolean }> {
    const accessSuccess = accessToken
      ? await this.accessTokenToBlacklist(accessToken)
      : true;
    const refreshSuccess = refreshToken
      ? await this.refreshTokenToBlacklist(refreshToken)
      : true;
    return { accessSuccess, refreshSuccess };
  }

  /**
   * Check if token is blacklisted by JTI
   * @param jti JWT ID to check
   * @returns Boolean indicating if token is blacklisted
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    return await this.authRepository.isTokenBlacklisted(jti);
  }

  // ===== Helper Methods =====

  /**
   * Find user by subject ID (sub claim)
   * @param sub User ID from JWT sub claim (can be string or number)
   * @returns User information or null
   */
  async findUserBySub(sub: string): Promise<ResponseUserDto | null> {
    return this.authRepository.findUserBySub(sub);
  }

  // ===== User Account Management =====

  /**
   * Delete user account (soft delete with email/nickname modification)
   * @param userId User ID to delete
   * @returns Success status and message
   * @throws NotFoundException If user not found
   */
  async deleteUserAccount(userId: string): Promise<{
    success: boolean;
    message: string;
    deletedUser: ResponseUserDto;
  }> {
    // Verify user exists and is active
    await this.userService.getUserById(userId);

    // Perform soft delete with email/nickname modification
    const deletedUser = await this.authRepository.deleteUser(userId);

    return {
      success: true,
      message: '계정이 성공적으로 삭제되었습니다.',
      deletedUser,
    };
  }
}
