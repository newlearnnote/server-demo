import { Test, TestingModule } from '@nestjs/testing';
import { NoteTagService } from './note-tag.service';

describe('NoteTagService', () => {
  let service: NoteTagService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NoteTagService],
    }).compile();

    service = module.get<NoteTagService>(NoteTagService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
