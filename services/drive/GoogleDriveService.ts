import type { DriveSyncPayload } from '../../types';

interface DriveFileItem {
  id: string;
  name: string;
}

interface DriveFileListResponse {
  files?: DriveFileItem[];
}

export class GoogleDriveService {
  private readonly fileName = 'bookstery_progress.json';
  private readonly driveApiBase = 'https://www.googleapis.com/drive/v3';
  private readonly uploadApiBase = 'https://www.googleapis.com/upload/drive/v3';

  async findSyncFileId(accessToken: string): Promise<string | null> {
    const query = encodeURIComponent(`name = '${this.fileName}' and 'appDataFolder' in parents and trashed = false`);
    const url = `${this.driveApiBase}/files?spaces=appDataFolder&q=${query}&fields=files(id,name)`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Google Drive API query error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as DriveFileListResponse;
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  }

  async downloadProgressFile(accessToken: string): Promise<DriveSyncPayload | null> {
    const fileId = await this.findSyncFileId(accessToken);
    if (!fileId) {
      return null;
    }

    const url = `${this.driveApiBase}/files/${fileId}?alt=media`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Google Drive API download error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as DriveSyncPayload;
  }

  async uploadProgressFile(accessToken: string, payload: DriveSyncPayload): Promise<void> {
    const fileId = await this.findSyncFileId(accessToken);
    const content = JSON.stringify(payload);

    if (fileId) {
      const url = `${this.uploadApiBase}/files/${fileId}?uploadType=media`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: content,
      });

      if (!response.ok) {
        throw new Error(`Google Drive API patch error: ${response.status} ${response.statusText}`);
      }
    } else {
      const metadata = {
        name: this.fileName,
        parents: ['appDataFolder'],
      };

      const boundary = '-------bookstery_boundary_token_314159';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const multipartBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        content +
        closeDelimiter;

      const url = `${this.uploadApiBase}/files?uploadType=multipart`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      });

      if (!response.ok) {
        throw new Error(`Google Drive API multipart creation error: ${response.status} ${response.statusText}`);
      }
    }
  }
}
