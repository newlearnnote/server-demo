import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { ResponseUserDto, UpdateUserDto } from './user.dto';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ID로 사용자 조회
   * @param id 사용자 ID
   * @returns 사용자 정보 또는 null
   */
  async findById(id: string): Promise<ResponseUserDto | null> {
    return await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      omit: { password: true },
    });
  }

  /**
   * 사용자 정보 업데이트 (낙관적 잠금 적용)
   * @param id 사용자 ID
   * @param dto 업데이트 데이터
   * @returns 업데이트된 사용자 정보
   * @description P2025 에러 발생 시 전역 필터에서 낙관적 잠금 충돌로 자동 변환됨
   */
  async updateUser(
    id: string,
    dto: UpdateUserDto,
  ): Promise<ResponseUserDto | null> {
    // Prisma의 update 메서드를 사용하여 조건부 업데이트
    // where 절에 id와 함께 버전 번호를 포함시켜 충돌 방지
    return await this.prisma.user.update({
      where: {
        id: id,
        deletedAt: null,
        version: dto.version, // 낙관적 잠금: 클라이언트가 보낸 버전과 일치해야 함
      },
      data: {
        // DTO의 데이터를 전개하고, 버전 번호를 1 증가시킴
        ...dto,
        version: dto.version + 1,
      },
      omit: { password: true },
    });
  }

  /**
   * 닉네임으로 사용자 조회
   * @param nickname 닉네임
   * @returns 사용자 정보 또는 null
   */
  async findByNickname(nickname: string): Promise<ResponseUserDto | null> {
    return await this.prisma.user.findFirst({
      where: { nickname, deletedAt: null },
    });
  }
}
