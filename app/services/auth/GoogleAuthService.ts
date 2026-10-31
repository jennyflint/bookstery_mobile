import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { SqliteService } from '../database/SqliteService';
import type { GoogleUser } from '../../types';

export class GoogleAuthService {
  private static instance: GoogleAuthService | null = null;
  private currentUser: GoogleUser | null = null;
  private isInitialized: boolean = false;
  private sqliteService: SqliteService;

  constructor(sqliteService?: SqliteService) {
    this.sqliteService = sqliteService || SqliteService.getInstance();
  }

  static getInstance(): GoogleAuthService {
    if (!GoogleAuthService.instance) {
      GoogleAuthService.instance = new GoogleAuthService();
    }
    return GoogleAuthService.instance;
  }

  async init(clientId?: string): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    try {
      await GoogleAuth.initialize({
        clientId: clientId || 'bookstery-android-client-id.apps.googleusercontent.com',
        scopes: [
          'profile',
          'email',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/drive.appdata',
        ],
        grantOfflineAccess: true,
      });
      this.isInitialized = true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`GoogleAuth initialization failed: ${message}`);
    }
  }

  async signIn(): Promise<GoogleUser> {
    await this.init();
    try {
      const response = await GoogleAuth.signIn();
      const user: GoogleUser = {
        id: response.id,
        email: response.email,
        displayName: response.name || response.givenName || 'Reader',
        imageUrl: response.imageUrl,
        accessToken: response.authentication.accessToken,
      };
      this.currentUser = user;
      await this.sqliteService.saveUserSession({
        email: user.email,
        display_name: user.displayName,
        last_sync_at: Date.now(),
      });
      return user;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Google Sign-In failed: ${message}`);
    }
  }

  async silentSignIn(): Promise<GoogleUser | null> {
    await this.init();
    try {
      const response = await GoogleAuth.refresh();
      if (response && response.accessToken) {
        if (this.currentUser) {
          this.currentUser.accessToken = response.accessToken;
          return this.currentUser;
        }
        const session = await this.sqliteService.getUserSession();
        if (session && session.email) {
          this.currentUser = {
            id: 'cached-user',
            email: session.email,
            displayName: session.display_name || 'Reader',
            accessToken: response.accessToken,
          };
          return this.currentUser;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async getAccessToken(): Promise<string> {
    if (!this.currentUser) {
      throw new Error('User is not authenticated with Google');
    }
    try {
      const refreshed = await GoogleAuth.refresh();
      if (refreshed && refreshed.accessToken) {
        this.currentUser.accessToken = refreshed.accessToken;
      }
    } catch {
    }
    return this.currentUser.accessToken;
  }

  async signOut(): Promise<void> {
    try {
      await GoogleAuth.signOut();
    } catch {
    } finally {
      this.currentUser = null;
      await this.sqliteService.resetUserSession();
      await this.sqliteService.setDriveFolderId(null);
    }
  }

  getCurrentUser(): GoogleUser | null {
    return this.currentUser;
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }
}
