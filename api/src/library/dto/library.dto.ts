import { UploadedFiles } from '@nestjs/common';
import { IsNumber, IsString, IsNotEmpty, IsOptional } from 'class-validator';

// ===== Request DTOs =====

export class DeletedFileDto {
  @IsString()
  @IsNotEmpty()
  path: string;

  @IsNumber()
  @IsOptional()
  deletedAt?: number; // timestamp
}

export class PushLibraryDto {
  @IsString()
  @IsNotEmpty()
  libraryId: string;

  @IsString()
  @IsNotEmpty()
  libraryName: string;

  // 마지막 push 타임스탬프 (증분 업로드용)
  @IsString()
  @IsOptional()
  lastPushTimestamp?: string;

  // 이전 push에서 지금 push 사이에 삭제된 파일들의 목록 (라이브러리 루트 이후 경로, 이름 포함)
  @IsOptional()
  deletedFiles?: DeletedFileDto[];
}

export class PullLibraryDto {
  @IsString()
  @IsNotEmpty()
  libraryId: string;

  @IsString()
  @IsNotEmpty()
  libraryName: string;
}

export class LinkLibraryDto {
  @IsString()
  @IsNotEmpty()
  libraryId: string;

  @IsString()
  @IsNotEmpty()
  libraryName: string;
}

export class CreateLibraryDto {
  @IsString()
  @IsNotEmpty()
  libraryName: string;
}

export class UpdateLibraryDto {
  // id는 파라미터로 받음

  @IsString()
  @IsNotEmpty()
  libraryName: string;
}

// ===== Response DTOs =====

/**
 * 라이브러리 메타데이터 (Response Interceptor가 success, timestamp, path 자동 추가)
 */
export interface LibraryMetadata {
  fileCount?: number;
  totalSize?: string; // "1.2 MB" 형태
  lastModified?: string; // ISO 8601
  createdAt?: string; // ISO 8601
}

/**
 * 라이브러리 존재 여부 응답
 */
export interface LibraryExistsResult {
  exists: boolean;
  metadata?: LibraryMetadata; // 존재하는 경우에만 포함
}

/**
 * 라이브러리 링크 데이터 (newlearnnote/userId.txt 파일용)
 */
export interface LibraryConfigData {
  id: string;
  name: string;
  linkedAt: string; // ISO 8601
  version: number;
  metadata?: LibraryMetadata; // 라이브러리 메타데이터 (파일 수, 크기, 최종 수정일)
}

export interface ResponseLibrary {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
