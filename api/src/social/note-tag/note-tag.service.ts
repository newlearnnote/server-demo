import { Injectable } from '@nestjs/common';
import { NoteTagRepository } from './note-tag.repository';
import { NoteTag, Prisma } from '@prisma/client';

@Injectable()
export class NoteTagService {
  constructor(private readonly noteTagRepository: NoteTagRepository) {}

  /**
   * Note와 Tag를 연결
   * @param noteId Note ID
   * @param tagId Tag ID
   * @param tx 트랜잭션 클라이언트 (옵션)
   * @returns 생성된 NoteTag
   */
  async createNoteTag(
    noteId: string,
    tagId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<NoteTag> {
    return await this.noteTagRepository.createNoteTag(noteId, tagId, tx);
  }

  /**
   * Note에 연결된 모든 Tag 조회
   * @param noteId Note ID
   * @returns NoteTag 배열
   */
  async findByNoteId(noteId: string): Promise<NoteTag[]> {
    return await this.noteTagRepository.findByNoteId(noteId);
  }

  // ===== DELETE =====
  async deleteNoteTagsByNoteIds(
    noteIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.noteTagRepository.deleteNoteTagsByNoteIds(noteIds, tx);
  }
}
