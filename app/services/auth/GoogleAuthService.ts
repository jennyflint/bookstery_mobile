import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { SqliteService } from '../database/SqliteService';
import type { GoogleUser, UserSession } from '../../types';

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
      let resolvedClientId = clientId?.trim();
      if (!resolvedClientId) {
        try {
          const nuxtGlobal = globalThis as unknown as {
            useRuntimeConfig?: () => { public?: { googleWebClientId?: string } };
          };
          if (typeof nuxtGlobal.useRuntimeConfig === 'function') {
            const config = nuxtGlobal.useRuntimeConfig();
            if (
              config?.public?.googleWebClientId &&
              typeof config.public.googleWebClientId === 'string' &&
              config.public.googleWebClientId.trim().length > 0
            ) {
              resolvedClientId = config.public.googleWebClientId.trim();
            }
          }
        } catch {
          // Runtime config might not be available in non-Nuxt contexts (e.g. tests)
        }
      }
      if (!resolvedClientId) {
        const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
        const envVal =
          typeof process !== 'undefined' && process.env?.VITE_GOOGLE_WEB_CLIENT_ID !== undefined
            ? process.env.VITE_GOOGLE_WEB_CLIENT_ID
            : metaEnv?.VITE_GOOGLE_WEB_CLIENT_ID;
        if (envVal && envVal.trim().length > 0) {
          resolvedClientId = envVal.trim();
        }
      }

      const initOptions: {
        scopes: string[];
        grantOfflineAccess: boolean;
        clientId?: string;
      } = {
        scopes: [
          'profile',
          'email',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/drive.appdata',
        ],
        grantOfflineAccess: true,
      };

      if (resolvedClientId && resolvedClientId.trim().length > 0) {
        initOptions.clientId = resolvedClientId.trim();
      }

      await GoogleAuth.initialize(initOptions);
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
      const email = response.email || '';
      const displayName =
        response.name || response.givenName || (email ? email.split('@')[0] : '') || 'Reader';

      let accessToken =
        response.authentication?.accessToken ||
        (response as { accessToken?: string }).accessToken ||
        response.authentication?.idToken ||
        (response as { idToken?: string }).idToken ||
        (response as { serverAuthCode?: string }).serverAuthCode ||
        '';

      if (!accessToken) {
        try {
          const refreshed = await GoogleAuth.refresh();
          accessToken =
            refreshed?.accessToken ||
            (refreshed as { authentication?: { accessToken?: string } })?.authentication
              ?.accessToken ||
            refreshed?.idToken ||
            '';
        } catch {
          // Deferred refresh; sign-in still succeeds
        }
      }

      const user: GoogleUser = {
        id: response.id || 'google-user',
        email,
        displayName,
        imageUrl: response.imageUrl,
        accessToken,
      };

      this.currentUser = user;
      await this.sqliteService.init();
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

  restoreUserFromSession(session: UserSession): GoogleUser {
    const email = session.email || '';
    const displayName =
      session.display_name || (email ? email.split('@')[0] : '') || 'Reader';
    const user: GoogleUser = {
      id: 'cached-user',
      email,
      displayName,
      accessToken: '',
    };
    this.currentUser = user;
    return user;
  }

  async silentSignIn(): Promise<GoogleUser | null> {
    await this.init();
    try {
      const response = await GoogleAuth.refresh();
      const accessToken =
        response?.accessToken ||
        (response as { authentication?: { accessToken?: string } })?.authentication
          ?.accessToken ||
        response?.idToken ||
        '';

      if (response && accessToken) {
        if (this.currentUser) {
          this.currentUser.accessToken = accessToken;
          return this.currentUser;
        }
        await this.sqliteService.init();
        const session = await this.sqliteService.getUserSession();
        if (session && session.email) {
          this.currentUser = {
            id: 'cached-user',
            email: session.email,
            displayName:
              session.display_name || (session.email ? session.email.split('@')[0] : '') || 'Reader',
            accessToken,
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
      const token =
        refreshed?.accessToken ||
        (refreshed as { authentication?: { accessToken?: string } })?.authentication?.accessToken ||
        refreshed?.idToken;
      if (token) {
        this.currentUser.accessToken = token;
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
      await this.sqliteService.init();
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
