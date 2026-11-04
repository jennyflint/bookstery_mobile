import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleAuthService } from '../../../app/services/auth/GoogleAuthService';
import { SqliteService } from '../../../app/services/database/SqliteService';
import { mockGoogleAuth } from '../../mocks/capacitor-plugins';

describe('GoogleAuthService', () => {
  let authService: GoogleAuthService;
  let sqliteService: SqliteService;

  beforeEach(() => {
    vi.clearAllMocks();
    sqliteService = new SqliteService();
    authService = new GoogleAuthService(sqliteService);
  });

  it('should initialize without clientId if none is provided or configured', async () => {
    const originalRuntimeConfig = (globalThis as unknown as { useRuntimeConfig?: unknown })
      .useRuntimeConfig;
    (globalThis as unknown as { useRuntimeConfig?: unknown }).useRuntimeConfig = () => ({
      public: { googleWebClientId: '' },
    });
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
    const originalEnv = metaEnv?.VITE_GOOGLE_WEB_CLIENT_ID;
    if (metaEnv) {
      metaEnv.VITE_GOOGLE_WEB_CLIENT_ID = '';
    }
    vi.stubEnv('VITE_GOOGLE_WEB_CLIENT_ID', '');
    try {
      const unconfiguredAuth = new GoogleAuthService(sqliteService);
      await unconfiguredAuth.init('');

      expect(mockGoogleAuth.initialize).toHaveBeenCalledWith({
        scopes: [
          'profile',
          'email',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/drive.appdata',
        ],
        grantOfflineAccess: true,
      });
    } finally {
      (globalThis as unknown as { useRuntimeConfig?: unknown }).useRuntimeConfig =
        originalRuntimeConfig;
      if (metaEnv && originalEnv !== undefined) {
        metaEnv.VITE_GOOGLE_WEB_CLIENT_ID = originalEnv;
      }
      vi.unstubAllEnvs();
    }
  });

  it('should initialize with clientId when non-empty clientId is provided', async () => {
    const customAuth = new GoogleAuthService(sqliteService);
    await customAuth.init('custom-client-id.apps.googleusercontent.com');

    expect(mockGoogleAuth.initialize).toHaveBeenCalledWith({
      clientId: 'custom-client-id.apps.googleusercontent.com',
      scopes: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.appdata',
      ],
      grantOfflineAccess: true,
    });
  });

  it('should sign in successfully and save user session into SQLite', async () => {
    const user = await authService.signIn();

    expect(mockGoogleAuth.signIn).toHaveBeenCalled();
    expect(user.email).toBe('reader@example.com');
    expect(user.displayName).toBe('Book Reader');
    expect(authService.isAuthenticated()).toBe(true);

    const session = await sqliteService.getUserSession();
    expect(session?.email).toBe('reader@example.com');
    expect(session?.display_name).toBe('Book Reader');
  });

  it('should handle token fallback when response.authentication.accessToken is missing', async () => {
    mockGoogleAuth.signIn.mockResolvedValueOnce({
      id: 'fallback-user',
      email: 'fallback@example.com',
      name: 'Fallback User',
      accessToken: 'top-level-token',
    });

    const user = await authService.signIn();

    expect(user.accessToken).toBe('top-level-token');
    expect(user.displayName).toBe('Fallback User');
    expect(authService.isAuthenticated()).toBe(true);
  });

  it('should attempt refresh if access token is initially missing from sign in response', async () => {
    mockGoogleAuth.signIn.mockResolvedValueOnce({
      id: 'refresh-user',
      email: 'refresh@example.com',
      name: 'Refresh User',
    });
    mockGoogleAuth.refresh.mockResolvedValueOnce({
      accessToken: 'refreshed-after-signin-token',
    });

    const user = await authService.signIn();

    expect(mockGoogleAuth.refresh).toHaveBeenCalled();
    expect(user.accessToken).toBe('refreshed-after-signin-token');
    expect(authService.isAuthenticated()).toBe(true);
  });

  it('should restore user from session without refresh token', () => {
    const restored = authService.restoreUserFromSession({
      id: 1,
      email: 'restored@example.com',
      display_name: 'Restored Reader',
      last_sync_at: Date.now(),
    });

    expect(restored.email).toBe('restored@example.com');
    expect(restored.displayName).toBe('Restored Reader');
    expect(authService.isAuthenticated()).toBe(true);
    expect(authService.getCurrentUser()?.email).toBe('restored@example.com');
  });

  it('should refresh token and restore user on silent sign-in with existing session', async () => {
    await sqliteService.saveUserSession({
      email: 'reader@example.com',
      display_name: 'Book Reader',
      last_sync_at: 1700000000000,
    });

    const user = await authService.silentSignIn();

    expect(mockGoogleAuth.refresh).toHaveBeenCalled();
    expect(user).not.toBeNull();
    expect(user?.accessToken).toBe('mock-refreshed-token');
    expect(authService.isAuthenticated()).toBe(true);
  });

  it('should purge all tokens, current user, and SQLite session and folder cache on signOut', async () => {
    await authService.signIn();
    await sqliteService.setDriveFolderId('test-folder-id-123');

    expect(authService.isAuthenticated()).toBe(true);
    expect(await sqliteService.getDriveFolderId()).toBe('test-folder-id-123');

    await authService.signOut();

    expect(mockGoogleAuth.signOut).toHaveBeenCalled();
    expect(authService.getCurrentUser()).toBeNull();
    expect(authService.isAuthenticated()).toBe(false);

    const session = await sqliteService.getUserSession();
    expect(session).toBeNull();

    const folderId = await sqliteService.getDriveFolderId();
    expect(folderId).toBeNull();
  });

  it('should throw an error when requesting access token while unauthenticated', async () => {
    await expect(authService.getAccessToken()).rejects.toThrow(
      'User is not authenticated with Google',
    );
  });
});
