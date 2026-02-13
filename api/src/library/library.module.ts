import { Module } from '@nestjs/common';
import { StorageModule } from '../common/module/storage/storage.module';
import { LibraryWebController } from './library-web.controller';
import { LibraryAppController } from './library-app.controller';
import { LibraryRepository } from './library.repository';
import { LibraryPrivateService } from './library-private.service';
import { LibraryCommonService } from './library-common.service';
import { LibraryPublishedService } from './library-published.service';
import { UserModule } from 'src/account/user/user.module';

@Module({
  imports: [StorageModule, UserModule],
  controllers: [LibraryWebController, LibraryAppController],
  providers: [
    LibraryPrivateService,
    LibraryCommonService,
    LibraryPublishedService,
    LibraryRepository,
  ],
  exports: [
    LibraryPrivateService,
    LibraryCommonService,
    LibraryPublishedService,
    LibraryRepository,
  ],
})
export class LibraryModule {}
