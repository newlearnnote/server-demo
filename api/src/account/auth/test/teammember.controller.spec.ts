import { Test, TestingModule } from '@nestjs/testing';
import { TeammemberController } from '../../team-member/teammember.controller';

describe('TeammemberController', () => {
  let controller: TeammemberController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeammemberController],
    }).compile();

    controller = module.get<TeammemberController>(TeammemberController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
