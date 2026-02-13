import { Module } from '@nestjs/common';
import { NoteNetworkService } from './note-network.service';
import { NoteNetworkRepository } from './note-network.repository';

@Module({
  providers: [NoteNetworkService, NoteNetworkRepository],
  exports: [NoteNetworkService, NoteNetworkRepository],
})
export class NoteNetworkModule {}
