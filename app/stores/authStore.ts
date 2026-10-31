import { defineStore } from 'pinia';
import { GoogleAuthService } from '../services/auth/GoogleAuthService';
import { SqliteService } from '../services/database/SqliteService';
import type { GoogleUser } from '../types';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as GoogleUser | null,
    isAuthenticated: false,
    isLoading: false,
  }),
  actions: {
    async init(): Promise<void> {
      this.isLoading = true;
      try {
        const sqlite = SqliteService.getInstance();
        const session = await sqlite.getUserSession();
        if (session && session.email) {
          const authService = GoogleAuthService.getInstance();
          const silentUser = await authService.silentSignIn();
          if (silentUser) {
            this.user = silentUser;
            this.isAuthenticated = true;
          }
        }
      } catch {
      } finally {
        this.isLoading = false;
      }
    },
    async login(): Promise<void> {
      this.isLoading = true;
      try {
        const authService = GoogleAuthService.getInstance();
        const user = await authService.signIn();
        this.user = user;
        this.isAuthenticated = true;

        const sqlite = SqliteService.getInstance();
        await sqlite.saveUserSession({
          email: user.email,
          display_name: user.displayName,
          last_sync_at: Date.now(),
        });
      } finally {
        this.isLoading = false;
      }
    },
    async logout(): Promise<void> {
      this.isLoading = true;
      try {
        const authService = GoogleAuthService.getInstance();
        await authService.signOut();
        this.user = null;
        this.isAuthenticated = false;

        const sqlite = SqliteService.getInstance();
        await sqlite.saveUserSession({
          email: null,
          display_name: null,
          last_sync_at: null,
        });
      } finally {
        this.isLoading = false;
      }
    },
  },
});
