import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Get,
  Query,
  Delete,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
  Patch,
} from '@nestjs/common';
import {
  LibraryConfigData,
  CreateLibraryDto,
  UpdateLibraryDto,
  ResponseLibrary,
} from './dto/library.dto';
import { ResponseSignedUrl } from './dto/file-content.dto';
import { JwtAuthGuard } from 'src/account/auth/jwt';
import { ResponseUserDto } from 'src/account/user/user.dto';
import { ResponseFileTree } from 'src/common/module/file/dto/file-tree.dto';
import { Library, User } from '@prisma/client';
import { LibraryPrivateService } from './library-private.service';
import { LibraryCommonService } from './library-common.service';
import { StorageService } from 'src/common/module/storage/storage.service';
import { LibraryOwnerGuard } from 'src/common/guards';

@Controller('web/libraries')
export class LibraryWebController {
  constructor(
    private readonly libraryPrivateService: LibraryPrivateService,
    private readonly libraryCommonService: LibraryCommonService,
    private readonly storageService: StorageService,
  ) {}

  // ===== CREATE FUNCTIONS =====

  /**
   * 로그인 된 사용자가 자신의 라이브러리를 생성
   * GCS에 라이브러리 폴더가 생성되고 DB에도 라이브러리 정보가 저장됨
   * 웹에서 create library 버튼을 눌렀을 때 호출되는 엔드포인트
   * createDto 예외처리는 DTO에서 Decorator로 처리
   * @param req
   * @param createDto
   * @returns
   */
  @Post('create')
  @UseGuards(JwtAuthGuard)
  async createLibrary(
    @Request() req: { user: ResponseUserDto },
    @Body() createDto: CreateLibraryDto,
  ): Promise<LibraryConfigData> {
    return await this.libraryPrivateService.createLibrary(
      req.user.id,
      createDto.libraryName,
    );
  }

  // ===== READ FUNCTIONS =====

  /**
   * 쿼리로 userId를 받아서 해당 사용자의 라이브러리 목록을 반환
   * 사용자 프로필 페이지에서 라이브러리 카테고리에서 호출되는 엔드포인트
   * @param userId
   * @returns 라이브러리가 없다면 빈 배열 반환
   */
  @Get('list')
  async getMyLibraries(
    @Query('userId') userId: string,
  ): Promise<ResponseLibrary[]> {
    if (!userId) {
      throw new BadRequestException('userId query parameter is required');
    }
    const libraries = await this.libraryCommonService.getUserLibraries(userId);
    const response: ResponseLibrary[] = libraries.map((lib) => ({
      id: lib.id,
      name: lib.name,
      createdAt: lib.createdAt.toISOString(),
      updatedAt: lib.updatedAt.toISOString(),
      ownerId: lib.userId,
    }));
    return response;
  }

  /**
   * 라이브러리 ID로 라이브러리 정보 조회
   * 웹에서 라이브러리 페이지 진입 시 호출되는 엔드포인트
   * @param libraryId
   * @returns
   */
  @Get(':libraryId')
  async getLibraryById(
    @Param('libraryId') libraryId: string,
  ): Promise<ResponseLibrary> {
    if (!libraryId) {
      throw new BadRequestException('libraryId parameter is required');
    }
    const lib = await this.libraryCommonService.getLibraryById(libraryId);
    return {
      id: lib.id,
      name: lib.name,
      createdAt: lib.createdAt.toISOString(),
      updatedAt: lib.updatedAt.toISOString(),
      ownerId: lib.userId,
    };
  }

  /**
   * ownerId 쿼리 파라미터와 libraryId 경로 파라미터로 publish된 라이브러리의 파일 트리 조회
   * ownerId는 요청한 사용자의 userId가 아니라 라이브러리 소유자의 userId임에 주의
   * 웹에서 어느 사용자의 라이브러리의 publish된 파일 트리를 조회할 때 호출되는 엔드포인트
   * @param libraryId
   * @param ownerId
   * @returns
   */
  @Get(':libraryId/file-tree/published')
  async getPublishedFileTree(
    @Param('libraryId') libraryId: string,
    @Query('ownerId') ownerId: string,
  ): Promise<ResponseFileTree> {
    if (!ownerId) {
      throw new BadRequestException('ownerId query parameter is required');
    }
    if (!libraryId) {
      throw new BadRequestException('libraryId parameter is required');
    }
    return await this.libraryCommonService.getFileTree(
      ownerId,
      libraryId,
      'published',
    );
  }

  /**
   * Published 폴더 내에 존재하는 파일과 폴더 목록 조회
   * 웹에서 Published 폴더를 클릭하여 내부 내용을 조회할 때 호출되는 엔드포인트
   * filePath에 GCS 전체 경로가 들어있기 때문에, libraryId, ownerId가 비즈니스 로직에서 사용되지는 않음
   * @param libraryId
   * @param folderPath
   * @param ownerId
   * @returns
   */
  @Get(':libraryId/file-tree/published/folder')
  async getPublishedFolderContents(
    @Param('libraryId') libraryId: string,
    @Query('path') folderPath: string,
    @Query('ownerId') ownerId: string,
  ): Promise<ResponseFileTree> {
    if (!libraryId) {
      throw new BadRequestException('libraryId is required');
    }
    if (!folderPath) {
      throw new BadRequestException('folderPath query parameter is required');
    }
    if (!ownerId) {
      throw new BadRequestException('ownerId query parameter is required');
    }

    return await this.libraryCommonService.getFolderContents(
      ownerId,
      folderPath,
    );
  }

  /**
   * Published 파일에 대한 Signed URL 생성
   * 웹에서 Published 파일을 클릭하여 상세 내용을 조회할 때 호출되는 엔드포인트
   * filePath에 GCS 전체 경로가 들어있기 때문에, libraryId, ownerId가 비즈니스 로직에서 사용되지는 않음
   * @param libraryId
   * @param ownerId
   * @param filePath
   * @returns
   */
  @Get(':libraryId/file-tree/published/file')
  async getPublishedFileSignedUrl(
    @Param('libraryId') libraryId: string,
    @Query('ownerId') ownerId: string,
    @Query('filePath') filePath: string,
  ): Promise<ResponseSignedUrl> {
    if (!libraryId) {
      throw new BadRequestException('libraryId is required');
    }
    if (!ownerId) {
      throw new BadRequestException('ownerId query parameter is required');
    }
    if (!filePath) {
      throw new BadRequestException('filePath query parameter is required');
    }

    return await this.storageService.getFileSignedUrl(filePath);
  }

  /**
   * Private 파일 트리 조회
   * 본인만 접근 가능
   * 웹에서 라이브러리 페이지에서 private 브랜치의 파일 트리를 조회할 때 호출되는 엔드포인트
   * 소유자 확인은 LibraryOwnerGuard에서 처리
   * @param req
   * @param libraryId
   * @returns
   */
  @Get(':libraryId/file-tree/private')
  @UseGuards(LibraryOwnerGuard)
  async getPrivateFileTree(
    @Request() req: { user: User },
    @Param('libraryId') libraryId: string,
  ): Promise<ResponseFileTree> {
    return await this.libraryCommonService.getFileTree(
      req.user.id,
      libraryId,
      'private',
    );
  }

  /**
   * Private 폴더 내에 존재하는 파일과 폴더 목록 조회
   * 본인만 접근 가능: JwtAuthGuard를 사용하여 라이브러리 소유자만 접근 허용
   * 웹에서 라이브러리 페이지에서 private 브랜치의 폴더를 클릭하여 내부 내용을 조회할 때 호출되는 엔드포인트
   * 소유자 확인은 LibraryOwnerGuard에서 처리
   * @param req
   * @param libraryId
   * @param folderPath
   * @returns
   */
  @Get(':libraryId/file-tree/private/folder')
  @UseGuards(LibraryOwnerGuard)
  async getPrivateFolderContents(
    @Request() req: { user: User },
    @Param('libraryId') libraryId: string,
    @Query('path') folderPath: string,
  ): Promise<ResponseFileTree> {
    if (!folderPath) {
      throw new BadRequestException('folderPath query parameter is required');
    }
    if (!libraryId) {
      throw new BadRequestException('libraryId parameter is required');
    }

    // TODO: 서비스 레이어에서 한번 더 userId로 소유자 확인을 함으로써 이중 보안 적용이 필요함
    // --> libraryCommonService가 아닌 libraryPrivateService로 변경 고려
    return await this.libraryCommonService.getFolderContents(
      req.user.id,
      folderPath,
    );
  }

  /**
   * Private 파일에 대한 Signed URL 생성
   * 본인만 접근 가능: JwtAuthGuard를 사용하여 라이브러리 소유자만 접근 허용
   * 웹에서 라이브러리 페이지에서 private 브랜치의 파일을 클릭하여 상세 내용을 조회할 때 호출되는 엔드포인트
   * 소유자 확인은 LibraryOwnerGuard에서 처리
   * @param libraryId 라이브러리명
   * @param ownerId 라이브러리 소유자 userId (쿼리 파라미터로 받음)
   * @param filePath 파일 전체 경로 (쿼리 파라미터로 받음)
   * @param req 요청 객체
   * @returns Signed URL 정보
   */
  @Get(':libraryId/file-tree/private/file')
  @UseGuards(LibraryOwnerGuard)
  async getPrivateFileSignedUrl(
    @Param('libraryId') libraryId: string,
    @Query('ownerId') ownerId: string,
    @Query('filePath') filePath: string,
    @Request() req: { user: User },
  ): Promise<ResponseSignedUrl> {
    if (!ownerId) {
      throw new BadRequestException('ownerId query parameter is required');
    }
    if (!filePath) {
      throw new BadRequestException('filePath query parameter is required');
    }
    if (!libraryId) {
      throw new BadRequestException('libraryId parameter is required');
    }

    // 가드말고도 한번 더 본인 확인
    if (req.user.id !== ownerId) {
      throw new ForbiddenException('Access denied: User ID mismatch');
    }

    return await this.storageService.getFileSignedUrl(filePath);
  }

  // ===== UPDATE FUNCTIONS =====

  /**
   * 라이브러리 정보 업데이트
   * 라이브러리 소유자만 접근 가능
   * 웹에서 라이브러리 설정 페이지에서 라이브러리 정보 수정 후 저장 버튼 클릭 시 호출되는 엔드포인트
   * 소유자 확인은 LibraryOwnerGuard에서 처리
   * @param req
   * @param libraryId
   * @param updateLibraryDto
   * @returns
   */
  @Patch(':libraryId/update')
  @UseGuards(LibraryOwnerGuard)
  async updateLibrary(
    @Request() req: { user: ResponseUserDto },
    @Param('libraryId') libraryId: string,
    @Body() updateLibraryDto: UpdateLibraryDto,
  ): Promise<Library> {
    if (!libraryId) {
      throw new BadRequestException('libraryId parameter is required');
    }
    return await this.libraryPrivateService.updateLibrary(
      req.user.id,
      libraryId,
      updateLibraryDto,
    );
  }

  // ===== DELETE FUNCTIONS =====

  /**
   * GCS에서 라이브러리 폴더를 완전 삭제
   * DB에서는 soft delete 처리
   * 웹 라이브러리 페이지에서 라이브러리 삭제 버튼 클릭 시 호출되는 엔드포인트
   * 라이브러리 소유자만 접근 가능
   * 소유자 확인은 LibraryOwnerGuard에서 처리
   * @param req
   * @param libraryId
   */
  @Delete(':libraryId')
  @UseGuards(LibraryOwnerGuard)
  async deleteLibrary(
    @Request() req: { user: ResponseUserDto },
    @Param('libraryId') libraryId: string,
  ): Promise<void> {
    if (!libraryId) {
      throw new BadRequestException('libraryId parameter is required');
    }

    // 존재 확인 후 GCS에서 라이브러리 폴더 완전 삭제
    return await this.libraryPrivateService.deleteLibrary(
      req.user.id,
      libraryId,
    );
  }
}
