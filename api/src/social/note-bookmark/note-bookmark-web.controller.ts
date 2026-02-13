import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { NoteBookmarkService } from './note-bookmark.service';
import {
  CreateBookmarkDto,
  ResponseBookmarkDto,
} from './dto/note-bookmark.dto';
import { JwtAuthGuard } from '../../account/auth/jwt/jwt-auth.guard';
import { NoteDetail } from '../note/note.dto';

@Controller('web/bookmarks')
@ApiTags('web-bookmarks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class NoteBookmarkWebController {
  constructor(private readonly noteBookmarkService: NoteBookmarkService) {}

  /**
   * 북마크 토글 (생성/삭제 통합)
   * 북마크가 없으면 생성, 있으면 삭제(Soft Delete)
   */
  @Post('toggle')
  @ApiOperation({
    summary: '북마크 토글',
    description: '북마크가 없으면 생성하고, 있으면 삭제합니다 (Soft Delete)',
  })
  @ApiResponse({
    status: 200,
    description: '북마크 토글 성공',
    type: ResponseBookmarkDto,
  })
  async toggleBookmark(
    @Request() req: any,
    @Body() createBookmarkDto: CreateBookmarkDto,
  ): Promise<ResponseBookmarkDto> {
    return this.noteBookmarkService.toggleBookmark(
      req.user.id,
      createBookmarkDto,
    );
  }

  /**
   * 사용자 북마크 목록 조회
   */
  @Get()
  async findBookmarks(@Request() req: any): Promise<NoteDetail[]> {
    return this.noteBookmarkService.findBookmarks(req.user.id);
  }

  /**
   * 사용자 북마크 개수 조회
   */
  @Get('count')
  async getBookmarkCount(
    @Request() req: any,
  ): Promise<{ count: number; message: string }> {
    const count = await this.noteBookmarkService.countBookmarks(req.user.id);
    return {
      count,
      message: '북마크 개수 조회 성공',
    };
  }
}
