import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { StorageService } from '../common/module/storage/storage.service';
import {
  LibraryConfigData,
  LibraryMetadata,
  DeletedFileDto,
  UpdateLibraryDto,
} from './dto/library.dto';
import { LibraryRepository } from './library.repository';
import { LibraryCommonService } from './library-common.service';
import { Library } from '@prisma/client';
import { SubscriptionService } from '../billing/subscription/subscription.service';

@Injectable()
export class LibraryPrivateService {
  // 상수 정의
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly BATCH_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB

  constructor(
    private readonly storageService: StorageService,
    private readonly libraryCommonService: LibraryCommonService,
    private readonly libraryRepository: LibraryRepository,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  // ===== CREATE =====

  /**
   * link 되지 않은(.newlearnnote/userId.txt가 없는) 로컬 디렉토리로부터 새 프로젝트 생성
   * @param userId
   * @param libraryName
   * @returns
   */
  async createLibrary(
    userId: string,
    libraryName: string,
  ): Promise<LibraryConfigData> {
    // 1. 라이브러리 개수 제한 검증
    await this.validateLibraryLimit(userId);

    // 2. 본인 계정 내에서 동일 이름의 라이브러리가 존재하는지 확인
    await this.libraryCommonService.checkLibraryName(userId, libraryName);

    // DB에 라이브러리 생성
    const library = await this.libraryRepository.createLibrary(
      userId,
      libraryName,
    );

    // /userId/libraryId 중복 확인 먼저 진행
    const gcpPath = `user-libraries/${userId}/${library.id}`;
    const exist = await this.storageService.pathExists(gcpPath);

    // 중복 폴더가 있다면, 라이브러리 생성 취소 및 에러 반환
    if (exist) {
      // 생성된 라이브러리 DB 레코드 삭제
      await this.libraryRepository.deleteLibraryById(library.id);
      // 폴더 ID 중복은 극한의 경우에만 발생하므로 ConflictException 사용하고,
      // 사용자에게는 재시도 안내 메시지 전달
      throw new ConflictException(
        `라이브러리 ID가 중복되어 실패했습니다. 다시 시도해주세요.`,
      );
    }
    await this.storageService.ensureLibraryFolder(userId, library.id);

    // Desktop App과 연결 파일에 필요한 정보 응답
    const libraryConfig: LibraryConfigData = {
      id: library.id,
      name: library.name,
      linkedAt: new Date().toISOString(),
      version: 1,
    };
    return libraryConfig;
  }

  // ===== GET =====

  // ===== UPDATE =====

  /**
   * 라이브러리 이름 변경
   * @param userId
   * @param libraryId
   * @param updateLibraryDto
   * @returns
   */
  async updateLibrary(
    userId: string,
    libraryId: string,
    updateLibraryDto: UpdateLibraryDto,
  ): Promise<Library> {
    const library = await this.libraryCommonService.getLibraryById(libraryId);
    // 소유자 확인은 Guard에서 이미 진행되었으므로 생략

    // 이름 변경 시 중복 확인
    const exists = await this.libraryCommonService.libraryExists(
      userId,
      updateLibraryDto.libraryName,
    );
    if (exists) {
      throw new BadRequestException(
        `라이브러리 '${updateLibraryDto.libraryName}'이 이미 존재합니다.`,
      );
    }
    // GCS 폴더명 변경: libraryName이 아닌 libraryId로 폴더 관리하므로 변경 불필요

    // DB 업데이트
    return await this.libraryRepository.updateLibraryById(
      library.id,
      updateLibraryDto,
    );
  }

  // ===== DELETE =====

  /**
   * GCS에서 라이브러리 완전 삭제
   * Library와 Note 삭제는 트랜잭션으로 처리
   * GCS 파일 삭제는 트랜잭션 완료 후 진행 (실패 시 보상 트랜잭션 불가능)
   * @param userId 사용자 ID
   * @param libraryId 라이브러리 ID
   */
  async deleteLibrary(userId: string, libraryId: string): Promise<void> {
    // 삭제 전 라이브러리 존재 확인 및 libraryId 가져오기
    const library = await this.libraryCommonService.getLibraryById(libraryId);

    // 컨트롤러 단계에서 가드로 소유자 확인을 하지만, 서비스 단계에서도 한 번 더 확인
    if (library.userId !== userId) {
      throw new BadRequestException(`라이브러리 소유자가 아닙니다.`);
    }

    // 트랜잭션으로 Library와 관련 Note들을 소프트 삭제
    await this.libraryRepository.deleteLibraryById(library.id);

    // GCS에서 라이브러리 폴더 완전 삭제
    // DB 트랜잭션이 성공한 후에만 GCS 파일 삭제 진행
    // GCS 삭제 실패 시 DB는 이미 소프트 삭제된 상태로 유지됨
    const gcpPath = `user-libraries/${userId}/${library.name}`;
    try {
      await this.storageService.deleteFolder(gcpPath);
    } catch (error) {
      // GCS 삭제 실패는 로그만 남기고 DB 상태는 유지
      // (소프트 삭제되었으므로 사용자에게는 삭제된 것으로 보임)
      console.error(
        `Failed to delete GCS folder: ${gcpPath}. DB records are soft-deleted.`,
        error,
      );
      throw new BadRequestException(
        'Failed to delete library files from storage: ' + error.message,
      );
    }
  }

  // ===== LINK/PUSH/OVERWRITE/PULL/PUBLISH =====

  /**
   * @param userId
   * @param libraryName
   * @returns
   * TODO: libraryName이 db에 존재하는지 확인 (실패 시 에러)
   * TODO: libraryName에 대한 GCS에 메타데이터 조회 (실패 시 에러)
   * TODO: .NLN_LINK.txt 파일 생성에 필요한 데이터 반환 (.LibraryConfigData.dto)
   */
  async linkLibrary(
    userId: string,
    libraryId: string,
  ): Promise<LibraryConfigData> {
    // 1. 라이브러리 존재 여부 확인
    // TODO: storageService에서 GCS에 접근하여 gcpPath가
    // 이미 존재하는지 확인. (DB, GCS 둘 다 확인하도록 수정 필요)
    const library = await this.libraryCommonService.getLibraryById(libraryId);
    if (library.userId !== userId) {
      throw new BadRequestException(`라이브러리 소유자가 아닙니다.`);
    }
    const gcpPath = `user-libraries/${userId}/${library.id}`;
    await this.storageService.pathExists(gcpPath);

    // 2. 라이브러리 메타데이터 조회
    const metadata = await this.libraryCommonService.getLibraryMetadata(
      userId,
      library.id,
    );

    // 3. 링크 데이터 생성
    const libraryConfig: LibraryConfigData = {
      id: library.id,
      name: library.name,
      linkedAt: new Date().toISOString(),
      version: 1,
      metadata,
    };

    return libraryConfig;
  }

  /**
   * 클라이언트에서 보낸 파일들을 받아서 해당 라이브러리에 업로드 (Push)
   * TODO: 업로드 진행률 추적 - 대용량 파일 업로드시 진행상황 반환
   * @param userId
   * @param files
   * @param libraryName
   * @param deletedFiles
   * @returns
   * @throws NotFoundException 라이브러리를 찾을 수 없는 경우
   * @throws InternalServerErrorException 파일 업로드 실패 시
   */
  async pushLibrary(
    userId: string,
    files: Express.Multer.File[],
    libraryId: string,
    deletedFiles?: DeletedFileDto[],
  ): Promise<LibraryMetadata> {
    // 1. 파일 검증
    this.validateFileSizes(files);
    this.validateBatchSize(files);
    await this.validateStorageLimit(userId, files);

    // GCS 경로는 libraryId 사용
    const gcpPath = `user-libraries/${userId}/${libraryId}/private`;

    try {
      let uploadSize = 0;
      let deleteSize = 0;

      // 2. 삭제할 파일 크기 계산 및 삭제
      if (deletedFiles && deletedFiles.length > 0) {
        const deletePromises = deletedFiles.map(async (fileDto) => {
          const filePath = `${gcpPath}/${fileDto.path.replace(/__SLASH__/g, '/')}`;

          // 파일 크기 조회 (삭제 전)
          try {
            const size = await this.storageService.getFileSize(filePath);
            deleteSize += size;
          } catch (error) {
            // 파일이 이미 없으면 무시 (크기는 0으로 계산)
            console.warn(`File not found for size calculation: ${filePath}`);
          }

          // 파일 삭제
          await this.storageService.deleteFile(filePath);
        });

        await Promise.all(deletePromises); // ← 병렬 삭제
      }

      // 3. 업로드 파일 크기 계산 및 업로드
      const uploadPromises = files.map((file) => {
        const decodedFileName = file.originalname.replace(/__SLASH__/g, '/');
        const filePath = `${gcpPath}/${decodedFileName}`;
        uploadSize += file.size;

        // Buffer → PassThrough Stream 변환 (메모리 효율성)
        const { PassThrough } = require('stream');
        const bufferStream = new PassThrough();
        bufferStream.end(file.buffer);

        return this.storageService.uploadStream(bufferStream, filePath);
      });

      await Promise.all(uploadPromises); // ← 병렬 업로드

      // 4. storageUsed 증분 업데이트 (업로드 - 삭제)
      const netChange = uploadSize - deleteSize;
      if (netChange !== 0) {
        await this.libraryRepository.updateStorageUsed(libraryId, netChange);
      }

      return {
        fileCount: files.length,
        totalSize: this.libraryCommonService.formatFileSize(uploadSize),
        lastModified: new Date().toISOString(),
      };
    } catch (error) {
      // Repository나 하위 서비스에서 발생한 예외를 그대로 전달
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      // 그 외의 에러는 서버 에러로 처리
      throw new InternalServerErrorException(
        `라이브러리 업로드에 실패했습니다: ${error.message}`,
      );
    }
  }

  /**
   * 클라이언트에서 보낸 파일들을 받아서 해당 라이브러리에 업로드
   * Push와는 다르게 deletedFiles 처리 없이 전체 삭제후 업로드 진행
   * TODO: 업로드 진행률 추적 - 대용량 파일 업로드시 진행상황 반환
   * @param userId
   * @param files
   * @param libraryId
   * @returns
   */
  async overwriteLibrary(
    userId: string,
    files: Express.Multer.File[],
    libraryId: string,
  ): Promise<LibraryMetadata> {
    // 1. 파일 검증
    this.validateFileSizes(files);
    this.validateBatchSize(files);
    await this.validateStorageLimit(userId, files);

    // GCS 경로는 libraryId 사용
    const gcpPath = `user-libraries/${userId}/${libraryId}/private`;
    try {
      // 2. 기존 파일들 삭제
      await this.storageService.deleteFolder(gcpPath);
      await this.storageService.ensureLibraryFolder(userId, libraryId);

      // 3. 새 파일 업로드 및 크기 계산
      let totalSize = 0;
      const uploadPromises = files.map((file) => {
        const decodedFileName = file.originalname.replace(/__SLASH__/g, '/');
        const filePath = `${gcpPath}/${decodedFileName}`;
        totalSize += file.size;

        // Buffer → PassThrough Stream 변환 (메모리 효율성)
        const { PassThrough } = require('stream');
        const bufferStream = new PassThrough();
        bufferStream.end(file.buffer);

        return this.storageService.uploadStream(bufferStream, filePath);
      });

      await Promise.all(uploadPromises); // ← 병렬 업로드

      // 4. storageUsed 재설정 (전체 덮어쓰기이므로)
      await this.libraryRepository.setStorageUsed(libraryId, totalSize);

      return {
        fileCount: files.length,
        totalSize: this.libraryCommonService.formatFileSize(totalSize),
        lastModified: new Date().toISOString(),
      };
    } catch (error) {
      // Repository나 하위 서비스에서 발생한 예외를 그대로 전달
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      // 그 외의 에러는 서버 에러로 처리
      throw new InternalServerErrorException(
        `라이브러리 덮어쓰기에 실패했습니다: ${error.message}`,
      );
    }
  }

  /**
   * 프로젝트에 있는 데이터 로컬로 pull
   * TODO: 대용량 파일 압축 진행률 표시 - 스트림 이벤트로 구현
   * TODO: 대용량 파일 스트리밍 - 메모리 효율성 개선
   * @param userId
   * @param libraryId
   * @returns
   */
  async pullLibraryAsStream(
    userId: string,
    libraryId: string,
  ): Promise<NodeJS.ReadableStream> {
    // GCS 경로는 libraryId 사용
    const gcpPath = `user-libraries/${userId}/${libraryId}/private`;

    try {
      const stream =
        await this.storageService.downloadFolderAsZipStream(gcpPath);
      return stream;
    } catch (error) {
      console.error(`[Pull] Failed to download from ${gcpPath}:`, error);
      throw error;
    }
  }

  // ===== 검증 로직 (Private Methods) =====

  /**
   * 라이브러리 개수 제한 검증
   * @param userId 사용자 ID
   * @throws BadRequestException 제한 초과 시
   */
  private async validateLibraryLimit(userId: string): Promise<void> {
    const currentCount =
      await this.libraryCommonService.getLibraryCount(userId);
    const limit = await this.subscriptionService.getLibraryLimit(userId);

    if (limit !== null && currentCount >= limit) {
      const plan = await this.subscriptionService.getCurrentPlan(userId);
      throw new BadRequestException(
        `${plan.name} plan allows maximum ${limit} library(ies). ` +
          `Current: ${currentCount}. ` +
          `Please upgrade your plan to create more libraries.`,
      );
    }
  }

  /**
   * 스토리지 용량 제한 검증
   * @param userId 사용자 ID
   * @param files 업로드할 파일 목록
   * @throws BadRequestException 용량 초과 시
   */
  private async validateStorageLimit(
    userId: string,
    files: Express.Multer.File[],
  ): Promise<void> {
    const uploadSize = files.reduce((sum, file) => sum + file.size, 0);
    const currentUsage =
      await this.libraryCommonService.getTotalStorageUsage(userId);
    const storageLimit = await this.subscriptionService.getStorageLimit(userId);

    if (currentUsage + uploadSize > storageLimit) {
      const availableSpace = storageLimit - currentUsage;
      const plan = await this.subscriptionService.getCurrentPlan(userId);

      throw new BadRequestException(
        `Insufficient storage space.\n` +
          `Current plan: ${plan.name}\n` +
          `Available space: ${this.subscriptionService.formatBytes(availableSpace)}\n` +
          `Upload size: ${this.subscriptionService.formatBytes(uploadSize)}\n` +
          `Storage used: ${this.subscriptionService.formatBytes(currentUsage)} / ` +
          `${this.subscriptionService.formatBytes(storageLimit)}\n` +
          `Please upgrade your plan for more storage.`,
      );
    }
  }

  /**
   * 개별 파일 크기 제한 검증 (10MB)
   * @param files 업로드할 파일 목록
   * @throws BadRequestException 파일 크기 초과 시
   */
  private validateFileSizes(files: Express.Multer.File[]): void {
    const oversizedFiles = files.filter(
      (file) => file.size > this.MAX_FILE_SIZE,
    );

    if (oversizedFiles.length > 0) {
      const fileList = oversizedFiles
        .map(
          (file) =>
            `- ${file.originalname}: ${this.subscriptionService.formatBytes(file.size)}`,
        )
        .join('\n');

      throw new BadRequestException(
        `Individual file size exceeds limit.\n` +
          `File size limit: ${this.subscriptionService.formatBytes(this.MAX_FILE_SIZE)}\n` +
          `Oversized files:\n${fileList}\n` +
          `Please reduce file sizes or upload separately.`,
      );
    }
  }

  /**
   * 배치 업로드 총 용량 제한 검증 (50MB)
   * @param files 업로드할 파일 목록
   * @throws BadRequestException 배치 크기 초과 시
   */
  private validateBatchSize(files: Express.Multer.File[]): void {
    const uploadSize = files.reduce((sum, file) => sum + file.size, 0);

    if (uploadSize > this.BATCH_SIZE_LIMIT) {
      throw new BadRequestException(
        `Upload batch size exceeds limit.\n` +
          `Batch limit: ${this.subscriptionService.formatBytes(this.BATCH_SIZE_LIMIT)}\n` +
          `Your upload: ${this.subscriptionService.formatBytes(uploadSize)} (${files.length} files)\n` +
          `Please upload files in smaller batches.`,
      );
    }
  }
}
