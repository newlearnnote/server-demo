import { Module } from '@nestjs/common';
import { NoteTagService } from './note-tag.service';
import { NoteTagRepository } from './note-tag.repository';

@Module({
  providers: [NoteTagService, NoteTagRepository],
  exports: [NoteTagService, NoteTagRepository],
})
export class NoteTagModule {}
