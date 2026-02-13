import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NoteRepository } from './note.repository';
import { CreateNoteDto, NoteDetail, NoteWithTags } from './note.dto';
import { Note } from '@prisma/client';
import { StorageService } from 'src/common/module/storage/storage.service';
import { UserService } from 'src/account/user/user.service';

@Injectable()
export class NoteService {
  constructor(
    private readonly noteRepository: NoteRepository,
    private readonly userService: UserService,
    private readonly storageService: StorageService,
  ) {}

  // ===== CREATE =====
  /**
   * Note 생성 (제목 자동 생성 및 Repository에서 태그 처리)
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
    // title이 없다면, filepath에서 파일 이름 추출하여 제목으로 사용
    if (createNoteDto.title == undefined || createNoteDto.title == null) {
      const pathParts = filePath.split('/');
      const fileName = pathParts[pathParts.length - 1];
      const title = fileName.replace(/_/g, ' ').replace(/\.[^/.]+$/, '');
      createNoteDto.title = title;
    }

    // Repository에서 트랜잭션과 태그 처리를 모두 담당
    return await this.noteRepository.createNote(
      userId,
      libraryId,
      filePath,
      createNoteDto,
    );
  }

  /**
   * Note 업데이트 (제목 자동 생성 및 Repository에서 태그 처리)
   * @param noteId Note ID
   * @param filePath 파일 경로 (제목 자동 생성용)
   * @param updateNoteDto Note 업데이트 DTO
   * @returns 업데이트된 Note
   */
  async updateNote(
    noteId: string,
    filePath: string,
    updateNoteDto: CreateNoteDto,
  ): Promise<Note> {
    // title이 없다면, filepath에서 파일 이름 추출하여 제목으로 사용
    if (updateNoteDto.title == undefined || updateNoteDto.title == null) {
      const pathParts = filePath.split('/');
      const fileName = pathParts[pathParts.length - 1];
      const title = fileName.replace(/_/g, ' ').replace(/\.[^/.]+$/, '');
      updateNoteDto.title = title;
    }

    // Repository에서 트랜잭션과 태그 처리를 모두 담당
    return await this.noteRepository.updateNote(noteId, updateNoteDto);
  }

  async publishFileAsNote(
    userId: string,
    libraryId: string,
    filePath: string,
    createNoteDto: CreateNoteDto,
  ): Promise<NoteDetail> {
    // 상대 경로를 GCS 전체 경로로 변환 (보안: 서버에서만 GCS 경로 구성)
    const fullPrivateFilePath = `user-libraries/${userId}/${libraryId}/private/${filePath}`;

    // 1. 소스 파일이 존재하는지 확인 (Signed URL 생성으로 존재 여부 확인)
    try {
      await this.storageService.getFileSignedUrl(fullPrivateFilePath);
    } catch (error) {
      throw new BadRequestException(
        'You should push file to private library first.',
      );
    }

    // 2. filePath를 그대로 사용하여 published 경로 구성
    const destinationPath = `user-libraries/${userId}/${libraryId}/published/${filePath}`;

    // 3. 파일 복사 실행 (private → published)
    await this.storageService.copyFile(fullPrivateFilePath, destinationPath);

    // 4. Note 엔터티 Upsert (있으면 업데이트, 없으면 생성)
    // Note 처리 실패 시 보상 트랜잭션은 신중하게 처리:
    // - 기존 Note가 있었다면 파일은 보존 (기존 파일의 덮어쓰기였음)
    // - 새로운 Note였다면 파일 삭제 (불완전한 새 파일)
    try {
      const note = await this.upsertNote(
        userId,
        libraryId,
        destinationPath,
        createNoteDto,
      );
      return await this.getNoteWithTagsById(note.id);
    } catch (error) {
      // Note 처리 실패 시 로그 출력
      // 파일 삭제는 하지 않음 - 이미 복사된 파일은 유효한 상태이므로 보존
      // 사용자가 나중에 다시 publish 시도할 수 있도록 함
      console.error(
        `Note upsert failed for file: ${destinationPath}. File preserved for retry.`,
        error,
      );
      throw error;
    }
  }

  /**
   * Note Upsert (있으면 업데이트, 없으면 생성)
   * @param userId 사용자 ID
   * @param libraryId 라이브러리 ID
   * @param filePath 파일 경로
   * @param createNoteDto Note 생성/업데이트 DTO
   * @returns 생성되거나 업데이트된 Note
   */
  async upsertNote(
    userId: string,
    libraryId: string,
    filePath: string,
    createNoteDto: CreateNoteDto,
  ): Promise<Note> {
    // 1. 기존 Note 존재 여부 확인
    const existingNote = await this.noteRepository.findByFilePath(
      userId,
      libraryId,
      filePath,
    );

    if (existingNote) {
      // 2-1. 기존 Note가 있으면 업데이트
      return await this.updateNote(existingNote.id, filePath, createNoteDto);
    } else {
      // 2-2. 기존 Note가 없으면 새로 생성
      return await this.createNote(userId, libraryId, filePath, createNoteDto);
    }
  }

  // ===== READ =====
  async getNoteById(id: string): Promise<Note> {
    const note = await this.noteRepository.findById(id);
    if (!note) {
      throw new NotFoundException('Note not found');
    }
    return note;
  }

  async getNoteWithTagsById(id: string): Promise<NoteDetail> {
    const note = await this.noteRepository.findNoteWithTagsById(id);
    if (!note) {
      throw new NotFoundException('Note not found');
    }

    const user = await this.userService.getUserById(note.userId);

    return this.noteWithTagToNoteDetail(note, user.nickname);
  }

  async getNotesByUserId(userId: string): Promise<NoteDetail[]> {
    const notes = await this.noteRepository.findNotesWithTagsByUserId(userId);
    if (!notes || notes.length === 0) {
      return [];
    }
    const user = await this.userService.getUserById(userId);
    return (
      notes.map((note) => this.noteWithTagToNoteDetail(note, user.nickname)) ||
      []
    );
  }

  /**
   * 노트 파일 Signed URL 조회
   * @param noteId 노트 ID
   * @returns Signed URL 정보
   */
  async getNoteFileSignedUrl(noteId: string): Promise<{
    signedUrl: string;
    expiresAt: string;
    fileName: string;
    contentType: string;
  }> {
    // 1. 노트 조회
    const note = await this.getNoteById(noteId);

    // 2. Storage Service를 통해 Signed URL 생성
    const signedUrlData = await this.storageService.getFileSignedUrl(
      note.filePath,
    );

    return signedUrlData;
  }

  // ===== DELETE =====

  /**
   * Note 삭제 (관련 데이터 포함)
   * @param userId 사용자 ID
   * @param noteId Note ID
   */
  async deleteNoteById(userId: string, noteId: string): Promise<void> {
    const note = await this.getNoteById(noteId);
    if (note.userId !== userId) {
      throw new NotFoundException('Note not found');
    }
    // Repository에서 모든 삭제 로직 처리
    await this.noteRepository.deleteNoteById(noteId);
  }

  // ===== SUB FUNCTIONS =====

  private noteWithTagToNoteDetail(
    note: NoteWithTags,
    ownerNickname?: string,
  ): NoteDetail {
    return {
      id: note.id,
      title: note.title,
      version: note.version,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      ownerId: note.userId,
      ownerNickname: ownerNickname,
      bookmarkCount: note.bookmarkCount,
      commentCount: note.commentCount,
      tags: note.noteTags?.map((noteTag) => ({
        id: noteTag.tag.id,
        name: noteTag.tag.name,
      })),
    };
  }
}
