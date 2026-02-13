import { Test, TestingModule } from '@nestjs/testing';
import { NoteNetworkService } from './note-network.service';

describe('NoteNetworkService', () => {
  let service: NoteNetworkService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NoteNetworkService],
    }).compile();

    service = module.get<NoteNetworkService>(NoteNetworkService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
