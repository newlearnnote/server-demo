import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  CreateBookmarkDto,
  ResponseBookmarkDto,
} from './dto/note-bookmark.dto';
import { NoteBookmarkRepository } from './note-bookmark.repository';
import { NoteDetail } from '../note/note.dto';

@Injectable()
export class NoteBookmarkService {
  constructor(
    private readonly noteBookmarkRepository: NoteBookmarkRepository,
  ) {}

  /**
   * 북마크 토글 (없으면 생성, 있으면 삭제)
   */
  async toggleBookmark(
    userId: string,
    createBookmarkDto: CreateBookmarkDto,
  ): Promise<ResponseBookmarkDto> {
    const { noteId } = createBookmarkDto;

    const existingBookmark =
      await this.noteBookmarkRepository.findByUserAndNote(userId, noteId);

    if (existingBookmark) {
      // 이미 북마크가 있으면 삭제 (soft delete)
      await this.noteBookmarkRepository.deleteWithTransaction(
        existingBookmark.id,
        noteId,
      );

      return {
        id: existingBookmark.id,
        userId: existingBookmark.userId,
        noteId: existingBookmark.noteId,
        deletedAt: existingBookmark.deletedAt || undefined,
        isBookmarked: false,
        message: '북마크가 삭제되었습니다.',
      };
    } else {
      // 북마크가 없으면 생성
      const bookmark = await this.noteBookmarkRepository.createWithTransaction({
        userId,
        noteId,
      });

      return {
        id: bookmark.id,
        userId: bookmark.userId,
        noteId: bookmark.noteId,
        note: bookmark.note,
        createdAt: bookmark.createdAt,
        updatedAt: bookmark.createdAt,
        isBookmarked: true,
        message: '북마크가 생성되었습니다.',
      };
    }
  }

  /**
   * 사용자 북마크 목록 조회
   */
  async findBookmarks(userId: string): Promise<NoteDetail[]> {
    const bookmarks = await this.noteBookmarkRepository.findManyByUser(userId);
    return bookmarks.map((bookmark) => this.formatToNoteDetail(bookmark));
  }

  /**
   * 사용자 북마크 개수 조회
   */
  async countBookmarks(userId: string): Promise<number> {
    return this.noteBookmarkRepository.getCountByUser(userId);
  }

  // ----- SUB FUNCTIONS -----

  /**
   * 북마크를 NoteDetail 형식으로 변환
   */
  private formatToNoteDetail(bookmark: any): NoteDetail {
    return {
      id: bookmark.note.id,
      title: bookmark.note.title,
      version: 1, // 기본값 (실제 버전 정보가 없으므로)
      createdAt: bookmark.createdAt, // 북마크 생성일을 사용
      updatedAt: bookmark.createdAt, // 북마크 생성일을 사용
      ownerId: bookmark.note.userId,
      ownerNickname: bookmark.note.user.nickname,
      bookmarkCount: 0, // 실제 값은 별도 조회 필요
      commentCount: 0, // 실제 값은 별도 조회 필요
      filePath: undefined,
      tags: undefined,
      linkingNotes: undefined,
      linkedNotes: undefined,
    };
  }
}
