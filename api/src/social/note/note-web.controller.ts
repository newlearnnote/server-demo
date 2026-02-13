import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { NoteService } from './note.service';
import { NoteDetail } from './note.dto';
import { JwtAuthGuard } from 'src/account/auth/jwt';
import { ResponseUserDto } from 'src/account/user/user.dto';

@Controller('web/notes')
export class NoteWebController {
  constructor(private readonly noteService: NoteService) {}

  // ===== READ - 인증 불필요 =====

  /**
   *
   * @param userId
   * @param tag
   * @param page
   * @param limit
   * @returns
   */
  @Get()
  async getNotesByUserId(
    @Query('userId') userId?: string,
    @Query('tag') tag?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<NoteDetail[]> {
    if (!userId) {
      throw new BadRequestException('userId query parameter is required');
    }
    return await this.noteService.getNotesByUserId(userId);
  }

  /**
   * 노트와 관련 된 모든 정보 조인된 결과 반환
   * GET /web/notes/:noteId
   * @param noteId
   * @returns
   */
  @Get(':noteId')
  async getNoteDetailById(
    @Param('noteId') noteId: string,
  ): Promise<NoteDetail> {
    return await this.noteService.getNoteWithTagsById(noteId);
  }

  /**
   * 노트 컨텐츠 조회 (Signed URL)
   * GET /web/notes/:noteId/content
   * @param noteId
   * @returns
   */
  @Get(':noteId/content')
  async getNoteContent(@Param('noteId') noteId: string): Promise<{
    signedUrl: string;
    expiresAt: string;
    fileName: string;
    contentType: string;
  }> {
    return await this.noteService.getNoteFileSignedUrl(noteId);
  }

  // ===== DELETE =====

  /**
   * 노트 삭제
   * DELETE /web/notes/:noteId
   * @param req
   * @param noteId
   * @returns
   */
  @Delete(':noteId')
  @UseGuards(JwtAuthGuard)
  async deleteNoteById(
    @Request() req: { user: ResponseUserDto },
    @Param('noteId') noteId: string,
  ): Promise<void> {
    return await this.noteService.deleteNoteById(req.user.id, noteId);
  }
}
