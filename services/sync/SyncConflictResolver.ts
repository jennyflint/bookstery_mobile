import type { ConflictResolutionResult } from '../../types';

export interface ProgressState {
  locator: string;
  progress_percentage: number;
  updated_at: number;
}

export class SyncConflictResolver {
  static resolve(local: ProgressState, remote: ProgressState): ConflictResolutionResult {
    const timestampDifference = Math.abs(local.updated_at - remote.updated_at);

    if (timestampDifference <= 1000) {
      if (local.progress_percentage >= remote.progress_percentage) {
        return {
          winnerLocator: local.locator,
          winnerPercentage: local.progress_percentage,
          winnerUpdatedAt: local.updated_at,
          source: 'local',
        };
      }
      return {
        winnerLocator: remote.locator,
        winnerPercentage: remote.progress_percentage,
        winnerUpdatedAt: remote.updated_at,
        source: 'remote',
      };
    }

    if (local.updated_at > remote.updated_at) {
      return {
        winnerLocator: local.locator,
        winnerPercentage: local.progress_percentage,
        winnerUpdatedAt: local.updated_at,
        source: 'local',
      };
    }

    return {
      winnerLocator: remote.locator,
      winnerPercentage: remote.progress_percentage,
      winnerUpdatedAt: remote.updated_at,
      source: 'remote',
    };
  }
}
