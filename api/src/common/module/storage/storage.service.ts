import { Injectable } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { ConfigService } from '@nestjs/config';
import { CreateLibraryDto } from 'src/library/dto/library.dto';
import {
  ResponseFileTree,
  ResponseLibraryFolder,
  ResponseLibraryFile,
} from '../file/dto/file-tree.dto';

@Injectable()
export class StorageService {
  private storage: Storage;
  private bucketName: string;

  constructor(private readonly configService: ConfigService) {
    // Google Cloud Storage 초기화
    const keyFilename = this.configService.get<string>(
      'GOOGLE_APPLICATION_CREDENTIALS',
    );
    const serviceAccountKey = this.configService.get<string>(
      'GOOGLE_SERVICE_ACCOUNT_KEY',
    );

    const storageOptions: { [key: string]: unknown } = {};

    if (serviceAccountKey) {
      // JSON 키 내용이 환경 변수에 있는 경우
      try {
        storageOptions.credentials = JSON.parse(serviceAccountKey);
      } catch (error) {
        console.error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY JSON:', error);
      }
    } else if (keyFilename) {
      // 키 파일 경로가 있는 경우
      storageOptions.keyFilename = keyFilename;
    }

    this.storage = new Storage(storageOptions);

    // 버킷 이름은 환경 변수에서 가져오거나 기본값 사용
    this.bucketName = this.configService.get<string>(
      'GOOGLE_STORAGE_BUCKET',
      'your-bucket-name',
    );
  }

  /**
   * 파일을 Google Cloud Storage에 업로드
   * @param file 업로드할 파일
   * @param folder 저장할 폴더 (user-profile, silhouette 등)
   * @returns 업로드된 파일의 공개 URL
   */
  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    const fileName = this.generateFileName(file.originalname);
    const filePath = `${folder}/${fileName}`;

    const bucket = this.storage.bucket(this.bucketName);
    const fileUpload = bucket.file(filePath);

    const blobStream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
      },
    });

    return new Promise((resolve, reject) => {
      blobStream.on('error', (error) => {
        reject(error);
      });

      blobStream.on('finish', () => {
        // 공개 URL 생성 (버킷이 공개라고 가정)
        const publicUrl = this.getPublicUrl(filePath);
        resolve(publicUrl);
      });

      blobStream.end(file.buffer);
    });
  }

  /**
   * 기존 파일을 삭제
   * @param filePath 삭제할 파일의 경로
   */
  async deleteFile(filePath: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(filePath);

    await file.delete();
  }

  /**
   * 고유한 파일명 생성
   * @param originalName 원본 파일명
   * @returns 고유한 파일명
   */
  private generateFileName(originalName: string): string {
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1e9);
    const extension = originalName.split('.').pop();
    return `${timestamp}-${randomSuffix}.${extension}`;
  }

  /**
   * 공개 URL 생성
   * @param filePath 파일 경로
   * @returns 공개 URL
   */
  private getPublicUrl(filePath: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${filePath}`;
  }

  /**
   * URL에서 파일 경로 추출
   * @param url 파일 URL
   * @returns 파일 경로
   */
  extractFilePathFromUrl(url: string): string | null {
    const baseUrl = `https://storage.googleapis.com/${this.bucketName}/`;
    if (url.startsWith(baseUrl)) {
      return url.replace(baseUrl, '');
    }
    return null;
  }

  /**
   * 버퍼를 GCP에 업로드
   * @param buffer 파일 버퍼
   * @param gcpPath GCP 파일 경로
   */
  async uploadFileBuffer(buffer: Buffer, gcpPath: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(gcpPath);

    const stream = file.createWriteStream();

    return new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', resolve);
      stream.end(buffer);
    });
  }

  /**
   * GCP에서 파일 내용을 버퍼로 다운로드
   * @param gcpPath GCP 파일 경로
   * @returns 파일 버퍼
   */
  async downloadFileBuffer(gcpPath: string): Promise<Buffer> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(gcpPath);

    const [buffer] = await file.download();
    return buffer;
  }

  /**
   * GCP 폴더 내 파일 목록 조회
   * @param folderPath 폴더 경로
   * @returns 파일 목록
   */
  async listFiles(folderPath: string): Promise<string[]> {
    const bucket = this.storage.bucket(this.bucketName);
    const [files] = await bucket.getFiles({ prefix: folderPath });

    return files.map((file) => file.name);
  }

  /**
   * 사용자별 프로젝트 목록 조회
   * @param userId 사용자 ID
   * @returns 프로젝트 이름 목록
   */
  async listUserLibraries(userId: string): Promise<string[]> {
    const folderPath = `user-libraries/${userId}/`;
    const bucket = this.storage.bucket(this.bucketName);

    // delimiter를 사용해서 폴더 목록을 가져옴
    const [files, , apiResponse] = await bucket.getFiles({
      prefix: folderPath,
      delimiter: '/',
    });

    // prefixes에서 폴더 이름 추출
    const projectNames: string[] = [];
    const response = apiResponse as any; // 타입 우회

    if (response?.prefixes && Array.isArray(response.prefixes)) {
      response.prefixes.forEach((prefix: string) => {
        // prefix는 'user-libraries/2/projectName/' 형태
        const projectName = prefix.replace(folderPath, '').replace('/', '');
        if (projectName && !projectName.startsWith('.')) {
          projectNames.push(projectName);
        }
      });
    }

    // prefixes가 없다면 파일 목록에서 추출 (fallback)
    if (projectNames.length === 0) {
      const projectNamesSet = new Set<string>();
      files.forEach((file) => {
        const relativePath = file.name.replace(folderPath, '');
        const pathParts = relativePath.split('/');

        // 최소 2개 부분이 있어야 폴더 구조 (projectName/filename)
        if (
          pathParts.length >= 2 &&
          pathParts[0] &&
          !pathParts[0].startsWith('.')
        ) {
          projectNamesSet.add(pathParts[0]);
        }
      });
      projectNames.push(...Array.from(projectNamesSet));
    }

    return projectNames;
  }

  /**
   * GCP 폴더 삭제
   * @param folderPath 삭제할 폴더 경로
   */
  async deleteFolder(folderPath: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    const [files] = await bucket.getFiles({ prefix: folderPath });

    const deletePromises = files.map((file) => file.delete());
    await Promise.all(deletePromises);
  }

  /**
   * GCP에 폴더가 존재하는지 확인하고 없으면 생성
   * @param folderPath 폴더 경로
   */
  async ensureFolderExists(folderPath: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);

    // 폴더 경로가 /로 끝나지 않으면 추가
    const normalizedPath = folderPath.endsWith('/')
      ? folderPath
      : `${folderPath}/`;

    // .keep 파일을 생성해서 폴더 구조 유지
    const keepFilePath = `${normalizedPath}.keep`;
    const keepFile = bucket.file(keepFilePath);

    // 이미 폴더가 존재하는지 확인
    const [exists] = await keepFile.exists();

    if (!exists) {
      // 빈 .keep 파일 생성으로 폴더 구조 생성
      await keepFile.save('', {
        metadata: {
          contentType: 'text/plain',
        },
      });
    }
  }

  /**
   * 사용자 폴더 생성 보장
   * 이미 있다면 생성하지 않음
   * @param userId 사용자 ID
   */
  async ensureUserFolder(userId: string): Promise<void> {
    const userFolderPath = `user-libraries/${userId}`;
    await this.ensureFolderExists(userFolderPath);
  }

  /**
   * 라이브러리 폴더 생성 보장
   * @param userId 사용자 ID
   * @param libraryName 라이브러리명
   */
  async ensureLibraryFolder(userId: string, libraryId: string): Promise<void> {
    // 먼저 사용자 폴더 있는지 확인 후 없으면 생성
    await this.ensureUserFolder(userId);

    // 라이브러리 폴더 생성
    const libraryFolderPath = `user-libraries/${userId}/${libraryId}/private`;
    await this.ensureFolderExists(libraryFolderPath);
  }

  /**
   * GCP 폴더를 ZIP 스트림으로 다운로드
   * @param gcpPath GCP 폴더 경로
   * @returns ZIP 스트림
   */
  async downloadFolderAsZipStream(
    gcpPath: string,
  ): Promise<NodeJS.ReadableStream> {
    const archiver = require('archiver');
    const { PassThrough } = require('stream');

    const archive = archiver('zip', {
      zlib: { level: 9 }, // 압축 레벨
    });

    const passThrough = new PassThrough();
    archive.pipe(passThrough);

    try {
      // GCP에서 폴더 내 파일 목록 조회
      const normalizedPath = gcpPath.endsWith('/') ? gcpPath : `${gcpPath}/`;
      const bucket = this.storage.bucket(this.bucketName);
      const [files] = await bucket.getFiles({ prefix: normalizedPath });

      console.log(
        `[downloadFolderAsZipStream] Found ${files.length} files in ${normalizedPath}`,
      );

      // .keep 파일 제외하고 실제 파일들만 처리
      const actualFiles = files.filter((file) => !file.name.endsWith('.keep'));
      console.log(
        `[downloadFolderAsZipStream] ${actualFiles.length} actual files (excluding .keep)`,
      );

      // 각 파일을 ZIP에 추가
      for (const file of actualFiles) {
        const relativePath = file.name.replace(normalizedPath, '');
        if (relativePath) {
          console.log(
            `[downloadFolderAsZipStream] Adding file to ZIP: ${relativePath}`,
          );
          const readStream = file.createReadStream();
          archive.append(readStream, { name: relativePath });
        }
      }

      // ZIP 생성 완료
      archive.finalize();
    } catch (error) {
      console.error('Error creating ZIP stream:', error);
      archive.destroy();
      throw error;
    }

    return passThrough;
  }

  /**
   * 버퍼 스트림을 GCS에 업로드
   * @param bufferStream 업로드할 스트림
   * @param gcpPath GCS 저장 경로
   */
  async uploadStream(
    bufferStream: NodeJS.ReadableStream,
    gcpPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(gcpPath);
      const stream = file.createWriteStream({
        metadata: {
          contentType: 'application/octet-stream',
        },
      });

      stream.on('error', reject);
      stream.on('finish', resolve);

      bufferStream.pipe(stream);
    });
  }

  /**
   * GCS 경로 존재 여부 확인
   * @param gcpPath GCS 경로
   * @returns 존재 여부
   */
  async pathExists(gcpPath: string): Promise<boolean> {
    const bucket = this.storage.bucket(this.bucketName);
    const [files] = await bucket.getFiles({ prefix: gcpPath });
    return files.length > 0;
  }

  /**
   * GCS 파일에 대한 Signed URL 생성
   * @param gcpPath 전체 GCS 파일 경로
   * @param expiresInMinutes 유효 시간 (분 단위, 기본 15분)
   * @returns Signed URL 정보
   */
  async getFileSignedUrl(
    gcpPath: string,
    expiresInMinutes: number = 15,
  ): Promise<{
    signedUrl: string;
    expiresAt: string;
    fileName: string;
    contentType: string;
  }> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(gcpPath);

    // 파일 존재 여부 확인
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error('File not found');
    }

    // 파일 메타데이터 조회
    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType || 'application/octet-stream';

    // Signed URL 생성 (읽기 전용)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expiresAt,
    });

    // 파일명 추출
    const fileName = gcpPath.split('/').pop() || 'unknown';

    return {
      signedUrl,
      expiresAt: expiresAt.toISOString(),
      fileName,
      contentType,
    };
  }

  /**
   * 폴더 내 파일 트리 구조 조회
   * @param userId 사용자 ID
   * @param folderName 폴더 이름 (라이브러리명)
   * @returns 파일 트리 구조
   * private, published
   */
  async getFileTree(
    userId: string,
    folderName: string,
    status: 'private' | 'published',
  ): Promise<ResponseFileTree> {
    const folderPath = `user-libraries/${userId}/${folderName}/${status}`;
    const bucket = this.storage.bucket(this.bucketName);

    try {
      // GCS에서 해당 경로의 모든 파일과 폴더 조회
      const [files, , apiResponse] = await bucket.getFiles({
        prefix: folderPath + '/', // trailing slash 추가
        delimiter: '/', // 하위 폴더를 구분하기 위해 delimiter 사용
      });

      const folders: ResponseLibraryFolder[] = [];
      const fileList: ResponseLibraryFile[] = [];

      // API 응답에서 폴더 목록 추출 (prefixes)
      const response = apiResponse as any;
      if (response?.prefixes && Array.isArray(response.prefixes)) {
        for (const prefix of response.prefixes) {
          const subFolderName = prefix
            .replace(folderPath + '/', '')
            .replace(/\/$/, '');
          if (subFolderName && !subFolderName.startsWith('.')) {
            folders.push({
              name: subFolderName,
              path: prefix,
              isDirectory: true,
              childrenFolders: [],
              childrenFiles: [],
              totalFiles: 0,
            });
          }
        }
      }

      // 파일 목록 추출 (현재 폴더에 직접 있는 파일들만)
      for (const file of files) {
        const relativePath = file.name.replace(folderPath + '/', '');

        // 하위 폴더에 있는 파일이 아니고, .keep 파일이 아닌 경우만 포함
        if (
          relativePath &&
          !relativePath.includes('/') &&
          !relativePath.endsWith('.keep') &&
          !relativePath.startsWith('.')
        ) {
          // 파일 메타데이터 조회
          let fileSize: number | undefined;
          let fileLastModified: string | undefined;
          let mimeType: string | undefined;

          try {
            const [metadata] = await file.getMetadata();
            if (metadata.size) {
              fileSize = parseInt(metadata.size as string);
            }
            if (metadata.timeCreated) {
              fileLastModified = new Date(metadata.timeCreated).toISOString();
            }
            if (metadata.contentType) {
              mimeType = metadata.contentType;
            }
          } catch (error) {
            console.warn(`Failed to get metadata for ${file.name}`);
          }

          // 파일 확장자 추출
          const extension = relativePath.split('.').pop();

          fileList.push({
            name: relativePath,
            path: file.name,
            isDirectory: false,
            size: fileSize,
            lastModified: fileLastModified,
            extension: extension !== relativePath ? extension : undefined,
            mimeType,
          });
        }
      }

      return {
        folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
        files: fileList.sort((a, b) => a.name.localeCompare(b.name)),
        totalItems: folders.length + fileList.length,
      };
    } catch (error) {
      console.error('Error getting file tree:', error);
      throw new Error(`Failed to get file tree for folder: ${folderName}`);
    }
  }

  /**
   * 특정 폴더의 내용 조회 (동적 로딩용)
   * @param folderPath 전체 폴더 경로 (예: "user-libraries/userId/libraryName/private/folderName")
   * @param userId 사용자 ID (optional)
   * @returns 해당 폴더의 파일 트리 구조
   */
  async getFolderContents(
    userId: string,
    folderPath: string,
  ): Promise<ResponseFileTree> {
    const bucket = this.storage.bucket(this.bucketName);

    try {
      // folderPath에 slash가 두 번 연속으로 들어가는 경우 복원
      folderPath = folderPath.replace('//', '/');

      // 먼저 해당 폴더의 직접적인 파일들을 조회 (delimiter 없이)
      const [directFiles] = await bucket.getFiles({
        prefix: folderPath.endsWith('/') ? folderPath : folderPath + '/',
      });

      // 그 다음 하위 폴더 조회 (delimiter 사용)
      const [, , apiResponse] = await bucket.getFiles({
        prefix: folderPath.endsWith('/') ? folderPath : folderPath + '/',
        delimiter: '/',
      });

      const folders: ResponseLibraryFolder[] = [];
      const fileList: ResponseLibraryFile[] = [];

      // 하위 폴더 목록 추출
      const response = apiResponse as any;

      if (response?.prefixes && Array.isArray(response.prefixes)) {
        for (const prefix of response.prefixes) {
          const subFolderName = prefix
            .replace(
              folderPath.endsWith('/') ? folderPath : folderPath + '/',
              '',
            )
            .replace(/\/$/, '');
          if (subFolderName && !subFolderName.startsWith('.')) {
            folders.push({
              name: subFolderName,
              path: `${folderPath}/${subFolderName}`, // 전체 경로로 저장
              isDirectory: true,
              childrenFolders: [],
              childrenFiles: [],
              totalFiles: 0,
            });
          }
        }
      }

      // 파일 목록 추출 (직접적인 파일들만)
      const folderPrefixWithSlash = folderPath.endsWith('/')
        ? folderPath
        : folderPath + '/';

      // 파일 목록 추출 (직접적인 파일들만)
      for (const file of directFiles) {
        const relativePath = file.name.replace(folderPrefixWithSlash, '');

        if (
          relativePath &&
          !relativePath.includes('/') &&
          !relativePath.endsWith('.keep') &&
          !relativePath.startsWith('.')
        ) {
          // 파일 메타데이터 조회
          let fileSize: number | undefined;
          let fileLastModified: string | undefined;
          let mimeType: string | undefined;

          try {
            const [metadata] = await file.getMetadata();
            if (metadata.size) {
              fileSize = parseInt(metadata.size as string);
            }
            if (metadata.timeCreated) {
              fileLastModified = new Date(metadata.timeCreated).toISOString();
            }
            if (metadata.contentType) {
              mimeType = metadata.contentType;
            }
          } catch (error) {
            console.warn(`Failed to get metadata for ${file.name}`);
          }

          const extension = relativePath.split('.').pop();

          fileList.push({
            name: relativePath,
            path: `${folderPath}/${relativePath}`, // 전체 경로로 저장
            isDirectory: false,
            size: fileSize,
            lastModified: fileLastModified,
            extension: extension !== relativePath ? extension : undefined,
            mimeType,
          });
        }
      }

      return {
        folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
        files: fileList.sort((a, b) => a.name.localeCompare(b.name)),
        totalItems: folders.length + fileList.length,
      };
    } catch (error) {
      console.error('Error getting folder contents:', error);
      throw new Error(`Failed to get folder contents: ${folderPath}`);
    }
  }

  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    const sourceFile = bucket.file(sourcePath);
    const destinationFile = bucket.file(destinationPath);

    await sourceFile.copy(destinationFile);
  }

  async renameFolder(oldPath: string, newPath: string): Promise<void> {
    // oldPath로 시작하는 모든 파일을 newPath로 복사한 후, 기존 파일 삭제
    const bucket = this.storage.bucket(this.bucketName);

    // oldPath로 시작하는 모든 파일 조회
    const [files] = await bucket.getFiles({ prefix: oldPath });

    // 모든 파일에 대해 복사 및 삭제 작업 수행
    const renamePromises = files.map(async (file) => {
      const newFilePath = file.name.replace(oldPath, newPath);
      const newFile = bucket.file(newFilePath);
      await file.copy(newFile);
      await file.delete();
    });

    // 모든 복사 및 삭제 작업 완료 대기
    await Promise.all(renamePromises);
  }
}
