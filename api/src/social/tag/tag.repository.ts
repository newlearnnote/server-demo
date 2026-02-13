import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { Tag, Prisma } from '@prisma/client';

@Injectable()
export class TagRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 태그 이름으로 태그 찾기
   * @param name 태그 이름
   * @param tx 트랜잭션 클라이언트 (옵션)
   * @returns Tag 또는 null
   */
  async findByName(
    name: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Tag | null> {
    const client = tx ?? this.prisma;
    return await client.tag.findUnique({
      where: { name },
    });
  }

  /**
   * 태그 생성
   * @param name 태그 이름
   * @param tx 트랜잭션 클라이언트 (옵션)
   * @returns 생성된 Tag
   */
  async createTag(name: string, tx?: Prisma.TransactionClient): Promise<Tag> {
    const client = tx ?? this.prisma;
    return await client.tag.create({
      data: { name },
    });
  }

  /**
   * 태그가 없으면 생성하고, 있으면 기존 태그 반환 (upsert)
   * @param name 태그 이름
   * @param tx 트랜잭션 클라이언트 (옵션)
   * @returns Tag
   */
  async upsertTag(name: string, tx?: Prisma.TransactionClient): Promise<Tag> {
    const client = tx ?? this.prisma;
    return await client.tag.upsert({
      where: { name },
      create: { name },
      update: {}, // 이미 존재하면 업데이트 없이 반환
    });
  }
}
