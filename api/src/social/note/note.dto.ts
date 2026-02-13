import { Prisma } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';

// Include된 관계를 포함한 타입 정의
export type NoteWithTags = Prisma.NoteGetPayload<{
  include: { noteTags: { include: { tag: true } } };
}>;

export class CreateNoteDto {
  @IsOptional()
  @IsString()
  title: string;

  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString({ each: true })
  linkedNoteIds?: string[];
}

/**
 * 클라이언트한테 반환할 Note 상세 정보 DTO
 */
export interface NoteDetail {
  id: string;
  title: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
  ownerNickname?: string;

  // 통계 필드
  bookmarkCount: number;
  commentCount: number;

  // Optional fields
  filePath?: string;
  tags?: NoteTag[];
  linkingNotes?: NoteDetail[];
  linkedNotes?: NoteDetail[];
}

export interface NoteTag {
  id: string;
  name: string;
}
