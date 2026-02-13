import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Query,
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { StorageService } from '../storage/storage.service';

@Controller('files')
export class FileController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB 제한
      },
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return callback(
            new BadRequestException('Only image files are allowed!'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('type') type: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    try {
      let folder = 'user-avatar';
      if (type === 'silhouette') folder = 'silhouettes';

      const fileUrl = await this.storageService.uploadFile(file, folder);
      return { url: fileUrl };
    } catch (error) {
      console.error('File upload error:', error);
      throw new InternalServerErrorException('Failed to upload file');
    }
  }
}
