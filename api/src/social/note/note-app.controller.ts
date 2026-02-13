import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Body,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { NoteService } from './note.service';
import { ResponseUserDto } from 'src/account/user/user.dto';
import { NoteDetail, CreateNoteDto } from './note.dto';
import { JwtAuthGuard } from 'src/account/auth/jwt';

@Controller('desktop-app/notes')
export class NoteAppController {
  constructor(private readonly noteService: NoteService) {}

  // ===== READ =====

  /**
   * 내 노트 목록 조회
   * 해당 엔드포인트 위치 변경되면 안됨.
   * 아래 엔드포인트랑 충돌나면 안됨.
   * GET /desktop-app/notes/my
   * @param req
   * @returns
   */
  @Get('my')
  @UseGuards(JwtAuthGuard)
  async getMyNotes(
    @Request() req: { user: ResponseUserDto },
  ): Promise<NoteDetail[]> {
    return await this.noteService.getNotesByUserId(req.user.id);
  }

  /**
   * id로 노트 조회
   * GET /desktop-app/notes/:noteId
   * @param noteId
   * @returns
   */
  @Get(':noteId')
  async getNoteById(@Param('noteId') noteId: string): Promise<NoteDetail> {
    return await this.noteService.getNoteWithTagsById(noteId);
  }

  /**
   * 노트 컨텐츠 조회 (Signed URL)
   * GET /desktop-app/notes/:noteId/content
   * @param noteId
   * @returns
   */
  @Get(':noteId/content')
  async getNoteContent(@Param('noteId') noteId: string) {
    return await this.noteService.getNoteFileSignedUrl(noteId);
  }

  // ===== CREATE =====

  /**
   * private 파일을 published로 발행하여 노트 생성
   * POST /desktop-app/notes/publish
   * @param req
   * @param libraryId
   * @param filePath
   * @param createNoteDto
   * @returns
   */
  @Post('publish')
  @UseGuards(JwtAuthGuard)
  async publishFileAsNote(
    @Request() req: { user: ResponseUserDto },
    @Query('libraryId') libraryId: string,
    @Query('filePath') filePath: string,
    @Body() createNoteDto: CreateNoteDto,
  ): Promise<NoteDetail> {
    if (!libraryId) {
      throw new BadRequestException('libraryId query parameter is required');
    }
    if (!filePath) {
      throw new BadRequestException('filePath query parameter is required');
    }

    return await this.noteService.publishFileAsNote(
      req.user.id,
      libraryId,
      filePath,
      createNoteDto,
    );
  }

  // ===== DELETE =====

  /**
   * 노트 삭제
   * DELETE /desktop-app/notes/:noteId
   * @param req
   * @param noteId
   * @returns
   */
  @Delete(':noteId')
  @UseGuards(JwtAuthGuard)
  async deleteNoteById(
    @Request() req: { user: ResponseUserDto },
    @Param('noteId') noteId: string,
  ) {
    return await this.noteService.deleteNoteById(req.user.id, noteId);
  }
}
