import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import type { GoogleUser } from '../../types';

export class GoogleAuthService {
  private static instance: GoogleAuthService | null = null;
  private currentUser: GoogleUser | null = null;
  private isInitialized: boolean = false;

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
        scopes: ['profile', 'email', 'https://www.googleapis.com/auth/drive.appdata'],
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
        return await this.signIn();
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
    }
  }

  getCurrentUser(): GoogleUser | null {
    return this.currentUser;
  }
}
