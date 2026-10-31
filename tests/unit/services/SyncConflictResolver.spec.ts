import { describe, it, expect } from 'vitest';
import { SyncConflictResolver } from '../../../services/sync/SyncConflictResolver';

describe('SyncConflictResolver', () => {
  it('should choose local state when local updated_at is newer', () => {
    const local = {
      locator: '12',
      progress_percentage: 45.5,
      updated_at: 1700005000000,
    };
    const remote = {
      locator: '8',
      progress_percentage: 30.0,
      updated_at: 1700001000000,
    };

    const result = SyncConflictResolver.resolve(local, remote);
    expect(result.source).toBe('local');
    expect(result.winnerLocator).toBe('12');
    expect(result.winnerPercentage).toBe(45.5);
    expect(result.winnerUpdatedAt).toBe(1700005000000);
  });

  it('should choose remote state when remote updated_at is newer', () => {
    const local = {
      locator: 'epubcfi(/6/2[chap01]!/4/2:0)',
      progress_percentage: 15.0,
      updated_at: 1700000000000,
    };
    const remote = {
      locator: 'epubcfi(/6/4[chap02]!/4/2:0)',
      progress_percentage: 35.0,
      updated_at: 1700008000000,
    };

    const result = SyncConflictResolver.resolve(local, remote);
    expect(result.source).toBe('remote');
    expect(result.winnerLocator).toBe('epubcfi(/6/4[chap02]!/4/2:0)');
    expect(result.winnerPercentage).toBe(35.0);
    expect(result.winnerUpdatedAt).toBe(1700008000000);
  });

  it('should choose higher progress percentage when timestamps are identical', () => {
    const now = 1700000000000;
    const local = {
      locator: 'fb2-p-80',
      progress_percentage: 75.0,
      updated_at: now,
    };
    const remote = {
      locator: 'fb2-p-50',
      progress_percentage: 50.0,
      updated_at: now,
    };

    const result = SyncConflictResolver.resolve(local, remote);
    expect(result.source).toBe('local');
    expect(result.winnerLocator).toBe('fb2-p-80');
    expect(result.winnerPercentage).toBe(75.0);
  });

  it('should choose remote when timestamps are within clock drift delta and remote has higher progress', () => {
    const local = {
      locator: '5',
      progress_percentage: 20.0,
      updated_at: 1700000000500,
    };
    const remote = {
      locator: '10',
      progress_percentage: 40.0,
      updated_at: 1700000000000,
    };

    const result = SyncConflictResolver.resolve(local, remote);
    expect(result.source).toBe('remote');
    expect(result.winnerLocator).toBe('10');
    expect(result.winnerPercentage).toBe(40.0);
  });
});
