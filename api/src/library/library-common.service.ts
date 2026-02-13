import { UserService } from './../account/user/user.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { StorageService } from '../common/module/storage/storage.service';
import { LibraryMetadata } from './dto/library.dto';
import { LibraryRepository } from './library.repository';
import { ResponseFileTree } from 'src/common/module/file/dto/file-tree.dto';
import { Library } from '@prisma/client';

@Injectable()
export class LibraryCommonService {
  constructor(
    private readonly storageService: StorageService,
    private readonly userService: UserService,
    private readonly libraryRepository: LibraryRepository,
  ) {}

  // ===== GET =====

  /**
   * 사용자 id로 본인 라이브러리 list 반환
   * @param userId
   * @returns
   * @throws InternalServerErrorException DB 조회 실패 시
   */
  async getUserLibraries(userId: string): Promise<Library[]> {
    try {
      const libraries = await this.libraryRepository.findUserLibraries(userId);
      return libraries || [];
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `라이브러리 목록 조회에 실패했습니다: ${error.message}`,
      );
    }
  }

  /**
   * 라이브러리 ID로 라이브러리 조회
   * @param libraryId 라이브러리 ID
   * @returns
   */
  async getLibraryById(libraryId: string): Promise<Library> {
    const library = await this.libraryRepository.findLibraryById(libraryId);
    if (!library) {
      throw new NotFoundException(
        `라이브러리 ID '${libraryId}'을 찾을 수 없습니다.`,
      );
    }
    return library;
  }

  /**
   * 라이브러리의 status 별 파일트리 반환
   * @param userId 라이브러리 오너 id - 본인일 수도 있고, 다른 사람일 수도 있음
   * @param libraryId 라이브러리 이름
   * @param status 'published' | 'private'
   * @returns
   * @throws NotFoundException 사용자를 찾을 수 없는 경우
   * @throws InternalServerErrorException 파일 트리 조회 실패 시
   */
  async getFileTree(
    userId: string,
    libraryId: string,
    status: 'published' | 'private',
  ): Promise<ResponseFileTree> {
    try {
      await this.userService.getUserById(userId); // userId 유효성 검사
      return await this.storageService.getFileTree(userId, libraryId, status);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `파일 트리 조회에 실패했습니다: ${error.message}`,
      );
    }
  }

  /**
   * folderPath의 폴더 내부의 파일 및 폴더 목록 반환
   * @param userId 라이브러리 오너 id - 본인일 수도 있고, 다른 사람일 수도 있음
   * @param folderPath 폴더 경로
   * @returns
   * @throws InternalServerErrorException 폴더 내용 조회 실패 시
   */
  async getFolderContents(
    userId: string,
    folderPath: string,
  ): Promise<ResponseFileTree> {
    try {
      return await this.storageService.getFolderContents(userId, folderPath);
    } catch (error) {
      throw new InternalServerErrorException(
        `폴더 내용 조회에 실패했습니다: ${error.message}`,
      );
    }
  }

  /**
   * 라이브러리 메타 데이터 조회
   * @param userId
   * @param libraryId
   * @returns
   */
  async getLibraryMetadata(
    userId: string,
    libraryId: string,
  ): Promise<LibraryMetadata> {
    try {
      const gcpPath = `user-libraries/${userId}/${libraryId}`;

      // GCS에서 라이브러리 파일 목록 조회
      const files = await this.storageService.listFiles(gcpPath);

      if (!files || files.length === 0) {
        throw new Error('라이브러리에 파일이 없습니다.');
      }

      // 파일 메타데이터 초기화
      let totalSize = 0;
      let lastModified = new Date(0); // 최소값으로 초기화

      // 각 파일의 메타데이터 수집
      for (const file of files) {
        // 실제 파일 메타데이터 조회는 별도 구현 필요 (현재는 추정값 사용)
        const estimatedFileSize = 1024; // 1KB로 추정
        totalSize += estimatedFileSize;

        // 최종 수정일은 현재 시간으로 설정 (실제로는 각 파일의 메타데이터 조회 필요)
        if (lastModified.getTime() === 0) {
          lastModified = new Date();
        }
      }

      return {
        fileCount: files.length,
        totalSize: this.formatFileSize(totalSize),
        lastModified: lastModified.toISOString(),
        createdAt: lastModified.toISOString(), // 임시로 마지막 수정일로 설정
      };
    } catch (error) {
      console.error('메타데이터 조회 오류:', error);

      // 메타데이터 조회 실패 시 기본값 반환
      return {
        fileCount: 0,
        totalSize: '0 B',
        lastModified: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
    }
  }

  /**
   * 라이브러리 이름으로 라이브러리 조회
   * 없으면 예외 발생
   * @param userId
   * @param libraryId
   * @returns
   * @throws NotFoundException 라이브러리를 찾을 수 없는 경우
   * @throws InternalServerErrorException DB 조회 실패 시
   */
  async getLibraryByName(userId: string, libraryId: string): Promise<Library> {
    try {
      const library = await this.libraryRepository.findLibraryByName(
        userId,
        libraryId,
      );
      if (!library) {
        throw new NotFoundException(
          `라이브러리 '${libraryId}'을 찾을 수 없습니다.`,
        );
      }
      return library;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `라이브러리 조회에 실패했습니다: ${error.message}`,
      );
    }
  }

  // ===== FIND =====

  // ===== SUB =====

  /**
   * 라이브러리 이름 중복 확인
   * @param userId 라이브러리 소유자 ID
   * @param libraryName 라이브러리 이름
   */
  async checkLibraryName(userId: string, libraryName: string): Promise<void> {
    const exists = await this.libraryRepository.findLibraryByName(
      userId,
      libraryName,
    );
    if (exists) {
      throw new BadRequestException(
        `라이브러리 이름 '${libraryName}'이 이미 존재합니다.`,
      );
    }
  }

  /**
   * 라이브러리 소유자 여부 확인 - LibraryOwnerGuard, LibraryOwnerDesktopGuard 가드에서 사용됨
   * @param userId
   * @param libraryId
   * @returns
   * @throws InternalServerErrorException DB 조회 실패 시
   */
  async isLibraryOwner(userId: string, libraryId: string): Promise<boolean> {
    try {
      // findLibraryByName은 이미 userId로 필터링하므로
      // 라이브러리가 존재하면 무조건 해당 사용자의 소유
      const library = await this.libraryRepository.findLibraryById(libraryId);
      if (!library || library.userId !== userId) {
        return false;
      }
      return library !== null;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `라이브러리 소유자 확인에 실패했습니다: ${error.message}`,
      );
    }
  }

  async checkUserLibraryLimit(userId: string): Promise<boolean> {
    const libraries = await this.libraryRepository.findUserLibraries(userId);
    // 데모 버전은 최대 2개까지 생성 가능
    return libraries.length < 2;
  }

  /**
   * filePath가 private인지 published인지 확인
   * @param userId
   * @param libraryId
   * @param filePath
   * @returns
   */
  async checkFileStatus(
    userId: string,
    libraryId: string,
    filePath: string,
  ): Promise<'private' | 'published'> {
    // 경로 정규화 (이중 슬래시 제거, 상대 경로 공격 방지)
    const normalizedPath = filePath
      .replace(/\/+/g, '/')
      .replace(/^\/+|\/+$/g, '');

    // 정확한 베이스 경로들 정의
    const privateBasePath = `user-libraries/${userId}/${libraryId}/private/`;
    const publishedBasePath = `user-libraries/${userId}/${libraryId}/published/`;

    // private 경로로 시작하는지 확인
    if (normalizedPath.startsWith(privateBasePath)) {
      return 'private';
    }

    // published 경로로 시작하는지 확인
    if (normalizedPath.startsWith(publishedBasePath)) {
      return 'published';
    }

    // 어느 패턴에도 맞지 않으면 예외 발생
    throw new BadRequestException(`Invalid file path format: ${filePath}`);
  }

  /**
   * 라이브러리 존재 여부 확인
   * 있으면 true, 없으면 false 반환
   * @param userId
   * @param libraryId
   * @returns
   * @throws InternalServerErrorException DB 조회 실패 시
   */
  async libraryExists(userId: string, libraryId: string): Promise<boolean> {
    try {
      const library = await this.libraryRepository.findLibraryById(libraryId);
      return library !== null;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `라이브러리 존재 여부 확인에 실패했습니다: ${error.message}`,
      );
    }
  }

  // ===== HELPER =====

  /**
   * 파일 크기를 사람이 읽기 쉬운 형태로 변환
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
