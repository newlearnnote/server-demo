import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateBookmarkDto {
  @IsString()
  @IsNotEmpty()
  noteId: string;
}

export class ResponseBookmarkDto {
  id: string;
  userId: string;
  noteId: string;
  note?: {
    id: string;
    title: string;
    userId: string;
    user: {
      nickname: string;
      avatarUrl?: string;
    };
  };

  @ApiProperty({ description: '북마크 상태' })
  isBookmarked: boolean;

  @ApiProperty({ description: '응답 메시지' })
  message: string;

  @ApiPropertyOptional({ description: '생성일' })
  createdAt?: Date;

  @ApiPropertyOptional({ description: '수정일' })
  updatedAt?: Date;

  @ApiPropertyOptional({ description: '삭제일' })
  deletedAt?: Date | null;
}

export class BookmarkListResponseDto {
  bookmarks: ResponseBookmarkDto[];
  totalCount: number;
  page: number;
  limit: number;
}
