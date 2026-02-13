import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NoteBookmark } from '@prisma/client';

export type NoteBookmarkWithNote = NoteBookmark & {
  note: {
    id: string;
    title: string;
    userId: string;
    user: {
      nickname: string;
      avatarUrl?: string;
    };
  };
};

@Injectable()
export class NoteBookmarkRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 북마크 생성 또는 재활성화
   * 트랜잭션으로 북마크 생성/재활성화 및 노트 통계 업데이트
   */
  async createWithTransaction(data: {
    userId: string;
    noteId: string;
  }): Promise<NoteBookmarkWithNote> {
    return this.prisma.$transaction(async (prisma) => {
      // 기존 삭제된 북마크 확인
      const existingBookmark = await prisma.noteBookmark.findFirst({
        where: {
          userId: data.userId,
          noteId: data.noteId,
        },
      });

      let bookmark;

      if (existingBookmark && existingBookmark.deletedAt) {
        // 삭제된 북마크가 있으면 재활성화
        bookmark = await prisma.noteBookmark.update({
          where: { id: existingBookmark.id },
          data: { deletedAt: null },
          include: {
            note: {
              select: {
                id: true,
                title: true,
                userId: true,
                user: {
                  select: {
                    nickname: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        });
      } else {
        // 새로운 북마크 생성
        bookmark = await prisma.noteBookmark.create({
          data,
          include: {
            note: {
              select: {
                id: true,
                title: true,
                userId: true,
                user: {
                  select: {
                    nickname: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        });
      }

      // 노트의 북마크 수를 실제 개수로 동기화
      const actualCount = await prisma.noteBookmark.count({
        where: {
          noteId: data.noteId,
          deletedAt: null,
        },
      });

      await prisma.note.update({
        where: { id: data.noteId },
        data: {
          bookmarkCount: actualCount,
        },
      });

      return bookmark;
    });
  }

  /**
   * 사용자 ID와 노트 ID로 북마크 조회 (삭제되지 않은 것만)
   */
  async findByUserAndNote(
    userId: string,
    noteId: string,
  ): Promise<NoteBookmark | null> {
    return this.prisma.noteBookmark.findFirst({
      where: {
        userId,
        noteId,
        deletedAt: null,
      },
    });
  }

  /**
   * 사용자별 북마크 목록 조회 (삭제되지 않은 것만)
   */
  async findManyByUser(userId: string): Promise<NoteBookmarkWithNote[]> {
    return this.prisma.noteBookmark.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      include: {
        note: {
          select: {
            id: true,
            title: true,
            userId: true,
            user: {
              select: {
                nickname: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 사용자별 북마크 총 개수 조회
   */
  async getCountByUser(userId: string): Promise<number> {
    return this.prisma.noteBookmark.count({
      where: { userId, deletedAt: null },
    });
  }

  /**
   * 노트별 북마크 수 조회
   */
  async getCountByNote(noteId: string): Promise<number> {
    return this.prisma.noteBookmark.count({
      where: { noteId, deletedAt: null },
    });
  }

  /**
   * 트랜잭션으로 북마크 삭제 및 노트 통계 업데이트
   */
  async deleteWithTransaction(
    bookmarkId: string,
    noteId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (prisma) => {
      // 북마크 삭제
      await prisma.noteBookmark.update({
        where: { id: bookmarkId },
        data: { deletedAt: new Date() },
      });

      // 노트의 북마크 수를 실제 개수로 동기화
      const actualCount = await prisma.noteBookmark.count({
        where: {
          noteId: noteId,
          deletedAt: null,
        },
      });

      await prisma.note.update({
        where: { id: noteId },
        data: {
          bookmarkCount: actualCount,
        },
      });
    });
  }

  // ----- admin -----

  /**
   * 특정 노트를 북마크한 사용자 목록 조회 (관리자용)
   */
  async findUsersByNote(
    noteId: string,
    limit: number = 10,
  ): Promise<NoteBookmark[]> {
    return this.prisma.noteBookmark.findMany({
      where: { noteId },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
