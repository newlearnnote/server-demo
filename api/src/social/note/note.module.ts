import { Module } from '@nestjs/common';
import { NoteService } from './note.service';
import { NoteAppController } from './note-app.controller';
import { NoteRepository } from './note.repository';
import { UserModule } from 'src/account/user/user.module';
import { NoteWebController } from './note-web.controller';
import { StorageModule } from 'src/common/module/storage/storage.module';

@Module({
  imports: [UserModule, StorageModule],
  providers: [NoteService, NoteRepository],
  controllers: [NoteAppController, NoteWebController],
  exports: [NoteService, NoteRepository],
})
export class NoteModule {}
