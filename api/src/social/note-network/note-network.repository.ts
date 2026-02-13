import { Prisma } from '.prisma/client/default';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';

@Injectable()
export class NoteNetworkRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ===== DELETE =====
  async deleteNoteNetworksByNoteIds(
    noteIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.noteNetwork.updateMany({
      where: {
        // linkingNoteId or linkedNoteId 둘 다 고려하여 삭제.
        OR: [
          { linkingNoteId: { in: noteIds } },
          { linkedNoteId: { in: noteIds } },
        ],
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}
