import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { NoteBookmarkService } from './note-bookmark.service';
import {
  CreateBookmarkDto,
  ResponseBookmarkDto,
} from './dto/note-bookmark.dto';
import { JwtAuthGuard } from 'src/account/auth/jwt';

@Controller('desktop-app/bookmarks')
@UseGuards(JwtAuthGuard)
export class NoteBookmarkAppController {
  constructor(private readonly noteBookmarkService: NoteBookmarkService) {}

  @Post()
  async toggleBookmark(
    @Request() req: any,
    @Body() createBookmarkDto: CreateBookmarkDto,
  ): Promise<ResponseBookmarkDto> {
    return this.noteBookmarkService.toggleBookmark(
      req.user.id,
      createBookmarkDto,
    );
  }
}
