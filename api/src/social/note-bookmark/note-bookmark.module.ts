import { Module } from '@nestjs/common';
import { NoteBookmarkAppController } from './note-bookmark-app.controller';
import { NoteBookmarkService } from './note-bookmark.service';
import { NoteBookmarkRepository } from './note-bookmark.repository';
import { NoteBookmarkWebController } from './note-bookmark-web.controller';

@Module({
  imports: [],
  controllers: [NoteBookmarkAppController, NoteBookmarkWebController],
  providers: [NoteBookmarkService, NoteBookmarkRepository],
  exports: [NoteBookmarkService],
})
export class NoteBookmarkModule {}
