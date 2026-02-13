import { Injectable } from '@nestjs/common';
import { Note, Prisma } from '@prisma/client';
import { CreateNoteDto, NoteWithTags } from './note.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';

@Injectable()
export class NoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ===== CREATE =====
  /**
   * Note 생성 (태그와 함께 트랜잭션으로 처리)
   * @param userId 사용자 ID
   * @param libraryId 라이브러리 ID
   * @param filePath 파일 경로
   * @param createNoteDto Note 생성 DTO
   * @returns 생성된 Note
   */
  async createNote(
    userId: string,
    libraryId: string,
    filePath: string,
    createNoteDto: CreateNoteDto,
  ): Promise<Note> {
    // 트랜잭션으로 Note, Tag, NoteTag 생성
    return await this.prisma.$transaction(async (tx) => {
      // 1. Note 생성
      const note = await tx.note.create({
        data: {
          title: createNoteDto.title,
          filePath: filePath,
          user: { connect: { id: userId } },
          library: { connect: { id: libraryId } },
        },
      });

      // 2. Tags 처리 (있는 경우)
      if (createNoteDto.tags && createNoteDto.tags.length > 0) {
        for (const tagName of createNoteDto.tags) {
          // 2-1. Tag upsert (있으면 기존 것 사용, 없으면 생성)
          const tag = await tx.tag.upsert({
            where: { name: tagName },
            create: { name: tagName },
            update: {},
          });

          // 2-2. NoteTag 연결: 새로운 노트를 생성하는 것이므로 단순 생성
          await tx.noteTag.create({
            data: { noteId: note.id, tagId: tag.id },
          });
        }
      }

      return note;
    });
  }

  // ===== READ =====
  /**
   * ID로 Note 조회
   * @param id Note ID
   * @returns Note with tags 또는 null
   */
  async findById(id: string): Promise<Note | null> {
    return await this.prisma.note.findFirst({
      where: {
        id: id,
        deletedAt: null,
      },
    });
  }

  /**
   * ID로 Note 조회
   * @param id Note ID
   * @returns Note with tags 또는 null
   */
  async findNoteWithTagsById(id: string): Promise<NoteWithTags | null> {
    return await this.prisma.note.findFirst({
      where: {
        id: id,
        deletedAt: null,
      },
      include: {
        noteTags: { where: { deletedAt: null }, include: { tag: true } },
      },
    });
  }

  async findNotesWithTagsByUserId(userId: string): Promise<NoteWithTags[]> {
    return await this.prisma.note.findMany({
      where: {
        userId: userId,
        deletedAt: null,
      },
      // noteTags 관계 포함: deletedAt가 null인 태그만 포함
      include: {
        noteTags: { where: { deletedAt: null }, include: { tag: true } },
      },
    });
  }

  /**
   * 파일 경로로 Note 조회
   * @param userId 사용자 ID
   * @param libraryId 라이브러리 ID
   * @param filePath 파일 경로
   * @returns Note 또는 null
   */
  async findByFilePath(
    userId: string,
    libraryId: string,
    filePath: string,
  ): Promise<Note | null> {
    return await this.prisma.note.findFirst({
      where: {
        userId: userId,
        libraryId: libraryId,
        filePath: filePath,
        deletedAt: null,
      },
    });
  }

  // ===== UPDATE =====

  /**
   * Note 업데이트 (태그와 함께 트랜잭션으로 처리)
   * @param noteId Note ID
   * @param updateData 업데이트할 데이터
   * @returns 업데이트된 Note
   */
  async updateNote(
    noteId: string,
    updateData: Partial<CreateNoteDto>,
  ): Promise<Note> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Note 업데이트
      const updatedNote = await tx.note.update({
        where: {
          id: noteId,
          deletedAt: null,
        },
        data: {
          title: updateData.title,
          version: { increment: 1 }, // 버전 증가
          updatedAt: new Date(),
        },
      });

      // 2. 기존 태그 관계 소프트 삭제
      await tx.noteTag.updateMany({
        where: {
          noteId: noteId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      // 3. 새로운 태그들 추가
      if (updateData.tags && updateData.tags.length > 0) {
        for (const tagName of updateData.tags) {
          // 3-1. Tag upsert
          const tag = await tx.tag.upsert({
            where: { name: tagName },
            create: { name: tagName },
            update: {},
          });

          // 3-2. NoteTag 연결 (upsert 패턴)
          const existingNoteTag = await tx.noteTag.findFirst({
            where: { noteId: updatedNote.id, tagId: tag.id },
          });

          if (existingNoteTag) {
            await tx.noteTag.update({
              where: { id: existingNoteTag.id },
              data: { deletedAt: null, updatedAt: new Date() },
            });
          } else {
            await tx.noteTag.create({
              data: { noteId: updatedNote.id, tagId: tag.id },
            });
          }
        }
      }

      return updatedNote;
    });
  }

  // ===== DELETE =====

  /**
   * Note 삭제 (관련 NoteTag도 함께 소프트 삭제)
   * @param noteId Note ID
   * @param tx Prisma 트랜잭션 클라이언트 (선택적)
   */
  async deleteNoteById(noteId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 관련 NoteTag 소프트 삭제
      await tx.noteTag.updateMany({
        where: {
          noteId: noteId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      // 관련 NoteBookmark 소프트 삭제
      // 북마크는 삭제안하고, 사용자가 접근시 404 처리를 띄운 후 수동으로 삭제할 수 있도록 할까 고민중
      await tx.noteBookmark.updateMany({
        where: {
          noteId: noteId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      // Note 소프트 삭제
      await tx.note.updateMany({
        where: {
          id: noteId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });
    });
  }
}
