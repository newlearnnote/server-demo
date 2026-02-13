import { user_provider_enum, user_role_enum } from '@prisma/client';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  firstName?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  lastName?: string;

  @IsNumber()
  @IsNotEmpty()
  version: number;
}

// ===== 서버가 클라이언트에게 응답하는 프로필 정보 DTO =====

export class ResponseUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  nickname: string;
  avatarUrl: string;
  oauthId: string | null;
  role: user_role_enum;
  provider: user_provider_enum;
  version: number;

  // timestamps
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
