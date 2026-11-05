export type SyncStatus = 'pending' | 'processing' | 'synced' | 'failed';

export type SyncVisualState =
  | 'unauthenticated'
  | 'idle'
  | 'syncing'
  | 'success'
  | 'error'
  | 'offline';

export interface BookProgressRecord {
  bookId: string;
  locator: string;
  progressPercentage: number;
  updatedAt: number;
  deviceId?: string;
  title?: string;
  fileSize?: number;
}

export interface SyncManifestItem {
  updatedAt: number;
  progressPercentage: number;
  title?: string;
  fileSize?: number;
}

export type SyncManifest = Record<string, SyncManifestItem>;

export interface SyncQueueItem {
  id?: number;
  book_id: string;
  locator: string;
  progress_percentage: number;
  updated_at: number;
  status: SyncStatus;
}

export interface ConflictResolutionResult {
  winnerLocator: string;
  winnerPercentage: number;
  winnerUpdatedAt: number;
  source: 'local' | 'remote';
}

export interface DriveSyncPayload {
  version: number;
  device_id: string;
  updated_at: number;
  books: Record<
    string,
    {
      locator: string;
      progress_percentage: number;
      updated_at: number;
    }
  >;
}
