export interface ResponseFileTree {
  folders: ResponseLibraryFolder[];
  files: ResponseLibraryFile[];
  totalItems?: number; // 전체 아이템 수
}

export interface ResponseLibraryFolder {
  name: string;
  path: string;
  isDirectory: true;
  childrenFolders: ResponseLibraryFolder[];
  childrenFiles: ResponseLibraryFile[];
  size?: number; // 하위 파일들의 총 크기 (바이트)
  lastModified?: string; // ISO 8601
  totalFiles?: number; // 하위 파일 총 개수
}

export interface ResponseLibraryFile {
  name: string;
  path: string;
  isDirectory: false;
  size?: number; // 파일 크기 (바이트)
  lastModified?: string; // ISO 8601
  extension?: string; // "md", "ts", "json" 등
  mimeType?: string; // "text/markdown", "application/json" 등
}
