import { SqliteService } from '../database/SqliteService';
import { GoogleAuthService } from '../auth/GoogleAuthService';
import type { BookProgressRecord, SyncManifest } from '../../types';

interface DriveFileItem {
  id: string;
  name: string;
}

interface DriveFileListResponse {
  files?: DriveFileItem[];
}

export class GoogleDriveFolderService {
  private static instance: GoogleDriveFolderService | null = null;
  private readonly folderName = 'bookstery_AppStorageFolder';
  private readonly manifestFileName = 'manifest.json';
  private readonly driveApiBase = 'https://www.googleapis.com/drive/v3';
  private readonly uploadApiBase = 'https://www.googleapis.com/upload/drive/v3';
  private cachedFolderId: string | null = null;
  private sqliteService: SqliteService;
  private authService: GoogleAuthService;

  constructor(sqliteService?: SqliteService, authService?: GoogleAuthService) {
    this.sqliteService = sqliteService || SqliteService.getInstance();
    this.authService = authService || GoogleAuthService.getInstance();
  }

  static getInstance(): GoogleDriveFolderService {
    if (!GoogleDriveFolderService.instance) {
      GoogleDriveFolderService.instance = new GoogleDriveFolderService();
    }
    return GoogleDriveFolderService.instance;
  }

  private async resolveAccessToken(token?: string): Promise<string> {
    if (token) {
      return token;
    }
    return await this.authService.getAccessToken();
  }

  async ensureStorageFolder(accessToken?: string): Promise<string> {
    if (this.cachedFolderId) {
      return this.cachedFolderId;
    }

    const sqliteFolderId = await this.sqliteService.getDriveFolderId();
    if (sqliteFolderId) {
      this.cachedFolderId = sqliteFolderId;
      return sqliteFolderId;
    }

    const token = await this.resolveAccessToken(accessToken);
    const query = encodeURIComponent(
      `name = '${this.folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    );
    const url = `${this.driveApiBase}/files?q=${query}&fields=files(id,name)&spaces=drive`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Google Drive folder query failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as DriveFileListResponse;
    if (data.files && data.files.length > 0) {
      const folderId = data.files[0].id;
      this.cachedFolderId = folderId;
      await this.sqliteService.setDriveFolderId(folderId);
      return folderId;
    }

    const createUrl = `${this.driveApiBase}/files`;
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: this.folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Google Drive folder creation failed: ${createResponse.status} ${createResponse.statusText}`);
    }

    const createdFolder = (await createResponse.json()) as DriveFileItem;
    this.cachedFolderId = createdFolder.id;
    await this.sqliteService.setDriveFolderId(createdFolder.id);
    return createdFolder.id;
  }

  private async findFileInFolder(
    folderId: string,
    fileName: string,
    token: string,
  ): Promise<string | null> {
    const query = encodeURIComponent(`name = '${fileName}' and '${folderId}' in parents and trashed = false`);
    const url = `${this.driveApiBase}/files?q=${query}&fields=files(id,name)&spaces=drive`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Google Drive file query error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as DriveFileListResponse;
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  }

  async uploadBookProgress(
    folderId: string,
    bookId: string,
    data: BookProgressRecord,
    accessToken?: string,
  ): Promise<void> {
    const token = await this.resolveAccessToken(accessToken);
    const fileName = `${bookId}.json`;
    const content = JSON.stringify(data);
    const existingFileId = await this.findFileInFolder(folderId, fileName, token);

    if (existingFileId) {
      const url = `${this.uploadApiBase}/files/${existingFileId}?uploadType=media`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: content,
      });

      if (!response.ok) {
        throw new Error(`Google Drive progress patch failed: ${response.status} ${response.statusText}`);
      }
    } else {
      const metadata = {
        name: fileName,
        parents: [folderId],
      };
      const boundary = '-------bookstery_boundary_42';
      const multipartBody =
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        `\r\n--${boundary}\r\n` +
        'Content-Type: application/json\r\n\r\n' +
        content +
        `\r\n--${boundary}--`;

      const url = `${this.uploadApiBase}/files?uploadType=multipart`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      });

      if (!response.ok) {
        throw new Error(`Google Drive progress upload failed: ${response.status} ${response.statusText}`);
      }
    }

    await this.updateManifestItem(folderId, bookId, data.updatedAt, data.progressPercentage, token);
  }

  private async updateManifestItem(
    folderId: string,
    bookId: string,
    updatedAt: number,
    progressPercentage: number,
    token: string,
  ): Promise<void> {
    try {
      const currentManifest = (await this.fetchManifest(folderId, token)) || {};
      currentManifest[bookId] = {
        updatedAt,
        progressPercentage,
      };

      const content = JSON.stringify(currentManifest);
      const manifestFileId = await this.findFileInFolder(folderId, this.manifestFileName, token);

      if (manifestFileId) {
        await fetch(`${this.uploadApiBase}/files/${manifestFileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: content,
        });
      } else {
        const metadata = {
          name: this.manifestFileName,
          parents: [folderId],
        };
        const boundary = '-------bookstery_boundary_manifest';
        const multipartBody =
          `--${boundary}\r\n` +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          `\r\n--${boundary}\r\n` +
          'Content-Type: application/json\r\n\r\n' +
          content +
          `\r\n--${boundary}--`;

        await fetch(`${this.uploadApiBase}/files?uploadType=multipart`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        });
      }
    } catch {
    }
  }

  async fetchBookProgress(
    folderId: string,
    bookId: string,
    accessToken?: string,
  ): Promise<BookProgressRecord | null> {
    const token = await this.resolveAccessToken(accessToken);
    const fileName = `${bookId}.json`;
    const fileId = await this.findFileInFolder(folderId, fileName, token);

    if (!fileId) {
      return null;
    }

    const url = `${this.driveApiBase}/files/${fileId}?alt=media`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Google Drive book download failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as BookProgressRecord;
  }

  async fetchManifest(
    folderId: string,
    accessToken?: string,
  ): Promise<SyncManifest | null> {
    const token = await this.resolveAccessToken(accessToken);
    const fileId = await this.findFileInFolder(folderId, this.manifestFileName, token);

    if (!fileId) {
      return null;
    }

    const url = `${this.driveApiBase}/files/${fileId}?alt=media`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Google Drive manifest download failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as SyncManifest;
  }

  clearFolderCache(): void {
    this.cachedFolderId = null;
    this.sqliteService.setDriveFolderId(null).catch(() => {});
  }
}
