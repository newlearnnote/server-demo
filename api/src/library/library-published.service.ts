import { LibraryCommonService } from './library-common.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { StorageService } from '../common/module/storage/storage.service';
import { LibraryRepository } from './library.repository';
import { ResponseFileTree } from 'src/common/module/file/dto/file-tree.dto';

@Injectable()
export class LibraryPublishedService {
  constructor(
    private readonly storageService: StorageService,
    private readonly libraryCommonService: LibraryCommonService,
    private readonly libraryRepository: LibraryRepository,
  ) {}
}
