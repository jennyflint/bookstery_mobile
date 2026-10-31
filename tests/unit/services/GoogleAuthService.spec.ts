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
    await expect(authService.getAccessToken()).rejects.toThrow('User is not authenticated with Google');
  });
});
