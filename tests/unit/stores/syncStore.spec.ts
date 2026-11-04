import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSyncStore } from '../../../app/stores/syncStore';
import { useAuthStore } from '../../../app/stores/authStore';
import { GoogleAuthService } from '../../../app/services/auth/GoogleAuthService';
import { SqliteService } from '../../../app/services/database/SqliteService';
import { mockGoogleAuth } from '../../mocks/capacitor-plugins';

describe('syncStore', () => {
  let sqliteService: SqliteService;

  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    sqliteService = SqliteService.getInstance();
    await GoogleAuthService.getInstance().signOut();
  });

  it('starts in unauthenticated visual state when user is not logged in', async () => {
    const syncStore = useSyncStore();
    await syncStore.init();

    expect(syncStore.syncVisualState).toBe('unauthenticated');
  });

  it('transitions from unauthenticated to syncing and then success/idle on login', async () => {
    const authStore = useAuthStore();
    const syncStore = useSyncStore();

    await syncStore.init();
    expect(syncStore.syncVisualState).toBe('unauthenticated');

    await authStore.login();

    expect(authStore.isAuthenticated).toBe(true);
    // After login, sync is triggered and transitions out of unauthenticated
    expect(syncStore.syncVisualState).not.toBe('unauthenticated');
    expect(['syncing', 'success', 'idle']).toContain(syncStore.syncVisualState);
  });

  it('resets visual state to unauthenticated when authStore logs out', async () => {
    const authStore = useAuthStore();
    const syncStore = useSyncStore();

    await authStore.login();
    expect(syncStore.syncVisualState).not.toBe('unauthenticated');

    await authStore.logout();
    expect(syncStore.syncVisualState).toBe('unauthenticated');
  });

  it('refreshes queue count and retains idle state when authenticated and online', async () => {
    vi.useFakeTimers();
    try {
      const authStore = useAuthStore();
      const syncStore = useSyncStore();

      await authStore.login();
      expect(syncStore.syncVisualState).toBe('success');

      vi.advanceTimersByTime(2500);
      expect(syncStore.syncVisualState).toBe('idle');

      await sqliteService.init();
      await syncStore.refreshQueueCount();
      expect(syncStore.pendingQueueCount).toBe(0);
      expect(syncStore.syncVisualState).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('transitions to offline when offline is detected', async () => {
    const authStore = useAuthStore();
    const syncStore = useSyncStore();

    await authStore.login();
    syncStore.isOnline = false;

    await syncStore.refreshQueueCount();
    expect(syncStore.syncVisualState).toBe('offline');
  });
});
