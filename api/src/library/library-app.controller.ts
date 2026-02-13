import { CreateNoteDto } from './../social/note/note.dto';
import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Get,
  Query,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Res,
  Request,
  Delete,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
  CreateLibraryDto,
  LibraryMetadata,
  LinkLibraryDto,
  LibraryConfigData,
  PullLibraryDto,
  PushLibraryDto,
  ResponseLibrary,
} from './dto/library.dto';
import { JwtAuthGuard } from 'src/account/auth/jwt';
import { ResponseUserDto } from 'src/account/user/user.dto';
import { LibraryPrivateService } from './library-private.service';
import { LibraryCommonService } from './library-common.service';
import { LibraryOwnerGuard } from 'src/common/guards';

@Controller('desktop-app/libraries')
export class LibraryAppController {
  constructor(
    private readonly libraryPrivateService: LibraryPrivateService,
    private readonly libraryCommonService: LibraryCommonService,
  ) {}

  // ===== CREATE FUNCTIONS =====

  /**
   * 로그인 된 사용자가 자신의 라이브러리를 생성
   * GCS에 라이브러리 폴더가 생성되고 DB에도 라이브러리 정보가 저장됨
   * 로컬 프로젝트와 자동 연결을 위해서 메타데이터도 반환
   * 앱에서 create library 버튼을 눌렀을 때 호출되는 엔드포인트
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
   * 본인 라이브러리 목록 조회
   * 앱에서 로컬 폴더와 동기화 하기 전 어느 라이브러리들이 있는지 조회할 때 사용
   * @param userId
   * @returns
   */
  @Get('list')
  @UseGuards(JwtAuthGuard)
  async getMyLibraries(
    @Request() req: { user: ResponseUserDto },
  ): Promise<ResponseLibrary[]> {
    const libraries = await this.libraryCommonService.getUserLibraries(
      req.user.id,
    );
    const response: ResponseLibrary[] = libraries.map((lib) => ({
      id: lib.id,
      name: lib.name,
      createdAt: lib.createdAt.toISOString(),
      updatedAt: lib.updatedAt.toISOString(),
      ownerId: lib.userId,
    }));
    return response;
  }

  // ===== UPDATE FUNCTIONS =====

  /**
   * 라이브러리 이름 변경은 웹에서 가능
   */

  // ===== DELETE FUNCTIONS =====

  /**
   * 라이브러리 삭제
   * 라이브러리 오너 확인은 Guard에서 진행(libraryId로 소유주 확인, libraryId는 Param에 꼭 필요)
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
    await this.libraryPrivateService.deleteLibrary(req.user.id, libraryId);
  }

  // ===== PUSH/PULL/LINK FUNCTIONS =====

  /**
   * 라이브러리 목록에서 라이브러리를 선택하면 해당 라이브러리와 로컬 디렉토리를 연결
   * 로컬 프로젝트 루트 위치에 .newlearnnote/userId.json 파일이 생성되고 해당 파일 안에 라이브러리 메타데이터가 저장됨
   * @param req
   * @param linkDto
   * @returns
   */
  @Post('link')
  @UseGuards(JwtAuthGuard)
  async linkLibrary(
    @Request() req: { user: ResponseUserDto },
    @Body() linkLibraryDto: LinkLibraryDto,
  ): Promise<LibraryConfigData> {
    return await this.libraryPrivateService.linkLibrary(
      req.user.id,
      linkLibraryDto.libraryId,
    );
  }

  /**
   * 클라이언트에서 보낸 파일들을 받아서 해당 라이브러리에 업로드 (Push)
   * DTO에 삭제할 파일 경로 및 push 시점 타임스탬프, push할 라이브러리 이름 포함
   * 해당 DTO에서 예외처리 진행
   * 라이브러리 오너 확인은 Guard에서 진행(libraryId로 소유주 확인, libraryId는 Param에 꼭 필요)
   * @param req
   * @param files
   * @param pushLibraryDto
   * @returns
   */
  @Post(':libraryId/push')
  @UseGuards(LibraryOwnerGuard)
  @UseInterceptors(FilesInterceptor('files', 1000))
  async pushProjects(
    @Request() req: { user: ResponseUserDto },
    @UploadedFiles() files: Express.Multer.File[],
    @Body() pushLibraryDto: PushLibraryDto,
  ): Promise<LibraryMetadata> {
    return await this.libraryPrivateService.pushLibrary(
      req.user.id,
      files,
      pushLibraryDto.libraryId,
      pushLibraryDto.deletedFiles,
    );
  }

  /**
   * 클라이언트는 전체 파일을 넘겨서 요청함
   * private/ 이하의 모든 파일을 삭제 후 다시 업로드하는 방식으로 덮어씌움
   * 라이브러리 오너 확인은 Guard에서 진행(libraryId로 소유주 확인, libraryId는 Param에 꼭 필요)
   * @param req
   * @param files
   * @param pushLibraryDto
   * @returns
   */
  @Post(':libraryId/overwrite')
  @UseGuards(LibraryOwnerGuard)
  @UseInterceptors(FilesInterceptor('files', 1000))
  async overwriteLibrary(
    @Request() req: { user: ResponseUserDto },
    @UploadedFiles() files: Express.Multer.File[],
    @Body() pushLibraryDto: PushLibraryDto, // DeletedFileDto 없이, 라이브러리 이름만 사용함
  ): Promise<LibraryMetadata> {
    return await this.libraryPrivateService.overwriteLibrary(
      req.user.id,
      files,
      pushLibraryDto.libraryId,
    );
  }

  /**
   * 클라이언트에서 pull 요청 시 실행되는 엔드포인트
   * 서버는 해당 라이브러리의 모든 파일을 ZIP으로 압축하여 스트림으로 반환하여 클라이언트로 전송
   * 라이브러리 이름을 엔드포인트로 받을지 DTO로 받을지 고민했으나, 확장성을 위해 DTO로 받기로 결정
   * 라이브러리 오너 확인은 Guard에서 진행(libraryId로 소유주 확인, libraryId는 Param에 꼭 필요)
   * @param req
   * @param pullDto - 라이브러리 이름
   * @param response
   */
  @Post(':libraryId/pull')
  @UseGuards(LibraryOwnerGuard)
  async pullProject(
    @Request() req: { user: ResponseUserDto },
    @Body() pullDto: PullLibraryDto,
    @Res() response: Response,
  ): Promise<void> {
    const userId = req.user.id;
    const { libraryId, libraryName } = pullDto;

    // 데이터 ZIP 폴더로 압축 후 전달
    const zipStream = await this.libraryPrivateService.pullLibraryAsStream(
      userId,
      libraryId,
    );

    response.setHeader('Content-Type', 'application/zip');

    // RFC 5987: 한글/특수문자를 포함한 파일명 인코딩
    const encodedFilename = encodeURIComponent(libraryName);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${libraryName.replace(/[^\x00-\x7F]/g, '_')}.zip"; filename*=UTF-8''${encodedFilename}.zip`,
    );

    zipStream.pipe(response);
  }
}
