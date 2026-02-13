import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { NoteTag, Prisma } from '@prisma/client';

@Injectable()
export class NoteTagRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Note와 Tag를 연결 (Upsert: 있으면 복원, 없으면 생성)
   * @param noteId Note ID
   * @param tagId Tag ID
   * @param tx 트랜잭션 클라이언트 (옵션)
   * @returns 생성되거나 복원된 NoteTag
   */
  async createNoteTag(
    noteId: string,
    tagId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<NoteTag> {
    const client = tx ?? this.prisma;

    // 소프트 삭제를 고려한 upsert 패턴
    // 기존 관계가 있으면 복원, 없으면 생성
    const existingNoteTag = await client.noteTag.findFirst({
      where: { noteId, tagId },
    });

    return existingNoteTag
      ? await client.noteTag.update({
          where: { id: existingNoteTag.id },
          data: { deletedAt: null, updatedAt: new Date() },
        })
      : await client.noteTag.create({
          data: { noteId, tagId },
        });
  }

  /**
   * Note에 연결된 모든 Tag 조회
   * @param noteId Note ID
   * @returns NoteTag 배열
   */
  async findByNoteId(noteId: string): Promise<NoteTag[]> {
    return await this.prisma.noteTag.findMany({
      where: {
        noteId,
        deletedAt: null,
      },
      include: {
        tag: true,
      },
    });
  }

  // ===== DELETE =====
  async deleteNoteTagsByNoteIds(
    noteIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.noteTag.updateMany({
      where: {
        noteId: { in: noteIds },
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}
