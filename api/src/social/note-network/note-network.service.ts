import { NoteNetwork, noteNetworkType, Prisma } from '@prisma/client';
import { NoteNetworkRepository } from './note-network.repository';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class NoteNetworkService {
  constructor(private readonly noteNetworkRepository: NoteNetworkRepository) {}
  // ===== DELETE =====
  async deleteNoteNetworksByNoteIds(
    noteIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.noteNetworkRepository.deleteNoteNetworksByNoteIds(noteIds, tx);
  }
}
