import { Module } from '@nestjs/common';
import { FileController } from './file.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [FileController],
})
export class FileModule {}
