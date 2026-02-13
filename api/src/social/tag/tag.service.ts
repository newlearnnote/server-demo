import { Injectable } from '@nestjs/common';
import { TagRepository } from './tag.repository';
import { Tag, Prisma } from '@prisma/client';

@Injectable()
export class TagService {
  constructor(private readonly tagRepository: TagRepository) {}

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
    return await this.tagRepository.findByName(name, tx);
  }

  /**
   * 태그 생성
   * @param name 태그 이름
   * @param tx 트랜잭션 클라이언트 (옵션)
   * @returns 생성된 Tag
   */
  async createTag(name: string, tx?: Prisma.TransactionClient): Promise<Tag> {
    return await this.tagRepository.createTag(name, tx);
  }

  /**
   * 태그가 없으면 생성하고, 있으면 기존 태그 반환 (upsert)
   * @param name 태그 이름
   * @param tx 트랜잭션 클라이언트 (옵션)
   * @returns Tag
   */
  async upsertTag(name: string, tx?: Prisma.TransactionClient): Promise<Tag> {
    return await this.tagRepository.upsertTag(name, tx);
  }
}
