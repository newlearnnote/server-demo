import { Injectable } from '@nestjs/common';
import { User, user_provider_enum, TokenBlacklist } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateGoogleUserDto, CreateProfileDto } from './auth.dto';
import { ResponseUserDto } from '../user/user.dto';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new Google user with profile
   * @param createUserDto Google user creation data
   * @param createProfileDto Profile creation data
   * @returns Created user without password field
   */
  async createGoogleUser(
    createUserDto: CreateGoogleUserDto,
    createProfileDto: CreateProfileDto,
  ): Promise<ResponseUserDto> {
    return await this.prisma.user.create({
      data: {
        oauthId: createUserDto.oauthId,
        email: createUserDto.email,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        nickname: createProfileDto.nickname,
        avatarUrl: createProfileDto.avatarUrl,
        provider: 'google',
        password: null,
      },
      omit: { password: true },
    });
  }

  /**
   * Find user by email address
   * @param email Email address to search
   * @returns User object or null if not found
   */
  async findUserByEmail(email: string): Promise<User | null> {
    return await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
  }

  /**
   * Find user by OAuth ID and provider
   * @param oauthId OAuth provider user ID
   * @param provider OAuth provider type
   * @returns User without password field or null if not found
   */
  async findUserByOauthId(
    oauthId: string,
    provider: user_provider_enum,
  ): Promise<ResponseUserDto | null> {
    return await this.prisma.user.findFirst({
      where: {
        oauthId,
        provider,
        deletedAt: null,
      },
      omit: { password: true },
    });
  }

  /**
   * Find user by subject ID (JWT sub claim)
   * 현재 활성 구독 정보 포함
   * @param sub User ID from JWT token
   * @returns User without password field (with active subscription) or null if not found
   */
  async findUserBySub(sub: string): Promise<ResponseUserDto | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: sub,
        deletedAt: null,
      },
      include: {
        subscriptions: {
          where: {
            status: 'active',
            deletedAt: null,
          },
          include: {
            plan: true,
          },
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      omit: { password: true },
    });

    if (!user) {
      return null;
    }

    // subscriptions 배열을 subscription 단일 객체로 변환
    return {
      ...user,
      subscription: user.subscriptions[0] || null,
      subscriptions: undefined,
    } as ResponseUserDto;
  }

  // ===== Token Blacklist Management =====

  /**
   * Add token to blacklist
   * @param jti JWT ID to blacklist
   * @param expiresAt Token expiration date
   * @returns Created blacklist entry
   */
  async addToBlacklist(jti: string, expiresAt: Date): Promise<TokenBlacklist> {
    return await this.prisma.tokenBlacklist.create({
      data: {
        jti,
        expiresAt,
      },
    });
  }

  /**
   * Check if token is blacklisted
   * @param jti JWT ID to check
   * @returns Boolean indicating if token is blacklisted
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    const blacklistEntry = await this.prisma.tokenBlacklist.findUnique({
      where: { jti },
    });
    return !!blacklistEntry;
  }

  /**
   * Remove expired tokens from blacklist
   * @returns void
   */
  async cleanupExpiredBlacklistedTokens(): Promise<void> {
    await this.prisma.tokenBlacklist.deleteMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });
  }

  // ===== User Management =====

  /**
   * Soft delete user by modifying email and nickname to avoid unique constraint issues
   * @param userId User ID to delete
   * @returns Deleted user information
   */
  async deleteUser(userId: string): Promise<ResponseUserDto> {
    const now = new Date();
    const timestamp = now.getTime();

    // First get the current user to access oauthId
    const currentUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
        deletedAt: null,
      },
    });

    if (!currentUser) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }

    return await this.prisma.user.update({
      where: {
        id: userId,
        deletedAt: null, // Only delete active users
      },
      data: {
        // Modify email to avoid unique constraint when user wants to re-register
        email: `deleted_${timestamp}_${userId}@deleted.local`,
        // Modify nickname to avoid unique constraint
        nickname: `deleted_${timestamp}_${userId}`,
        // Modify OAuth info to avoid unique constraint (only if oauthId exists)
        oauthId: currentUser.oauthId
          ? `deleted_${timestamp}_${currentUser.oauthId}`
          : null,
        // Set deletion timestamp
        deletedAt: now,
      },
      omit: { password: true },
    });
  }
}
