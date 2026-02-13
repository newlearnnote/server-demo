import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Library, Prisma } from '@prisma/client';
import { UpdateLibraryDto } from './dto/library.dto';

@Injectable()
export class LibraryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 사용자의 모든 라이브러리 목록 조회
   * @param userId 사용자 ID
   * @returns 라이브러리 목록, 없으면 빈 배열 반환
   */
  async findUserLibraries(userId: string): Promise<Library[]> {
    const libraries = await this.prisma.library.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: {
        linkedAt: 'desc',
      },
    });

    return libraries || [];
  }

  async findLibraryById(libraryId: string): Promise<Library | null> {
    return await this.prisma.library.findFirst({
      where: {
        id: libraryId,
        deletedAt: null,
      },
    });
  }

  /**
   * 새 라이브러리 생성
   * @param userId 사용자 ID
   * @param name 라이브러리 이름
   * @returns 생성된 라이브러리
   */
  async createLibrary(userId: string, libraryName: string): Promise<Library> {
    return await this.prisma.library.create({
      data: {
        userId,
        name: libraryName,
      },
    });
  }

  /**
   * 라이브러리 정보 조회
   * @param userId 사용자 ID
   * @param libraryName 라이브러리 이름
   * @returns 라이브러리 정보, 없으면 null
   */
  async findLibraryByName(
    userId: string,
    libraryName: string,
  ): Promise<Library | null> {
    return await this.prisma.library.findFirst({
      where: {
        userId,
        name: libraryName,
        deletedAt: null,
      },
    });
  }

  /**
   * 라이브러리 정보 업데이트
   * @param libraryId 라이브러리 ID
   * @param updateData 업데이트할 데이터
   * @returns 업데이트된 라이브러리
   */
  async updateLibraryById(
    libraryId: string,
    updateData: UpdateLibraryDto,
  ): Promise<Library> {
    return await this.prisma.library.update({
      where: {
        id: libraryId,
      },
      data: {
        name: updateData.libraryName,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }

  /**
   * 라이브러리 삭제 (소프트 삭제)
   * @param libraryId 라이브러리 ID
   */
  async deleteLibraryById(libraryId: string): Promise<void> {
    const notes = await this.prisma.note.findMany({
      where: {
        libraryId,
        deletedAt: null,
      },
    });
    const noteIds = notes.map((note) => note.id);
    await this.prisma.$transaction(async (tx) => {
      // 노트 태그 삭제
      await tx.noteTag.updateMany({
        where: {
          noteId: { in: noteIds },
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
          noteId: { in: noteIds },
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      // 노트 삭제
      await tx.note.updateMany({
        where: {
          libraryId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      // 라이브러리 삭제
      await tx.library.update({
        where: {
          id: libraryId,
        },
        data: {
          deletedAt: new Date(),
        },
      });
    });
  }

  /**
   * 사용자의 라이브러리 개수 조회
   * @param userId 사용자 ID
   * @returns 라이브러리 개수
   */
  async findLibraryCountByUserId(userId: string): Promise<number> {
    return await this.prisma.library.count({
      where: {
        userId,
        deletedAt: null,
      },
    });
  }
}
