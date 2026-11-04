import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../../../app/stores/authStore';
import { useSyncStore } from '../../../app/stores/syncStore';
import { GoogleAuthService } from '../../../app/services/auth/GoogleAuthService';
import { SqliteService } from '../../../app/services/database/SqliteService';
import { mockGoogleAuth } from '../../mocks/capacitor-plugins';

describe('authStore', () => {
  let sqliteService: SqliteService;

  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    sqliteService = SqliteService.getInstance();
    await GoogleAuthService.getInstance().signOut();
  });

  it('sets isAuthenticated = false and user = null by default', () => {
    const authStore = useAuthStore();
    expect(authStore.isAuthenticated).toBe(false);
    expect(authStore.user).toBeNull();
    expect(authStore.isLoading).toBe(false);
  });

  it('restores user from SQLite session when silentSignIn fails on app restart', async () => {
    await sqliteService.init();
    await sqliteService.saveUserSession({
      email: 'persisted@example.com',
      display_name: 'Persisted User',
      last_sync_at: Date.now(),
    });

    mockGoogleAuth.refresh.mockRejectedValueOnce(new Error('Network error on startup'));

    const authStore = useAuthStore();
    await authStore.init();

    expect(authStore.isAuthenticated).toBe(true);
    expect(authStore.user).not.toBeNull();
    expect(authStore.user?.email).toBe('persisted@example.com');
    expect(authStore.user?.displayName).toBe('Persisted User');
  });

  it('restores user from silentSignIn when token refresh succeeds on init', async () => {
    await sqliteService.init();
    await sqliteService.saveUserSession({
      email: 'silent@example.com',
      display_name: 'Silent User',
      last_sync_at: Date.now(),
    });

    mockGoogleAuth.refresh.mockResolvedValueOnce({
      accessToken: 'refreshed-startup-token',
    });

    const authStore = useAuthStore();
    await authStore.init();

    expect(authStore.isAuthenticated).toBe(true);
    expect(authStore.user?.email).toBe('silent@example.com');
    expect(authStore.user?.accessToken).toBe('refreshed-startup-token');
  });

  it('sets isAuthenticated = true, populates user, and triggers sync on login', async () => {
    const authStore = useAuthStore();
    const syncStore = useSyncStore();

    expect(authStore.isAuthenticated).toBe(false);
    expect(syncStore.syncVisualState).toBe('unauthenticated');

    await authStore.login();

    expect(authStore.isAuthenticated).toBe(true);
    expect(authStore.user).not.toBeNull();
    expect(authStore.user?.email).toBe('reader@example.com');
    expect(authStore.user?.displayName).toBe('Book Reader');

    // Upon login, syncStore is initialized and sync is triggered
    expect(['syncing', 'success', 'idle']).toContain(syncStore.syncVisualState);
  });

  it('sets isAuthenticated = true, populates user even when GoogleAuth.signIn returns token in fallback fields', async () => {
    mockGoogleAuth.signIn.mockResolvedValueOnce({
      id: 'fallback-id-456',
      email: 'fallback.field@example.com',
      name: 'Fallback Name',
      accessToken: 'fallback-top-level-token',
    });

    const authStore = useAuthStore();
    await authStore.login();

    expect(authStore.isAuthenticated).toBe(true);
    expect(authStore.user?.email).toBe('fallback.field@example.com');
    expect(authStore.user?.accessToken).toBe('fallback-top-level-token');
  });

  it('resets user state and notifies syncStore on logout', async () => {
    const authStore = useAuthStore();
    const syncStore = useSyncStore();

    await authStore.login();
    expect(authStore.isAuthenticated).toBe(true);

    await authStore.logout();

    expect(authStore.isAuthenticated).toBe(false);
    expect(authStore.user).toBeNull();
    expect(syncStore.syncVisualState).toBe('unauthenticated');
    expect(GoogleAuthService.getInstance().isAuthenticated()).toBe(false);
  });
});
