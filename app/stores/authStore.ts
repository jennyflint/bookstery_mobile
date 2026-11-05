import { defineStore } from 'pinia';
import { GoogleAuthService } from '../services/auth/GoogleAuthService';
import { SqliteService } from '../services/database/SqliteService';
import { useSyncStore } from './syncStore';
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
        await sqlite.init();
        const session = await sqlite.getUserSession();
        if (session && session.email) {
          const authService = GoogleAuthService.getInstance();
          const silentUser = await authService.silentSignIn();
          if (silentUser) {
            this.user = silentUser;
            this.isAuthenticated = true;
          } else {
            const restoredUser = authService.restoreUserFromSession(session);
            this.user = restoredUser;
            this.isAuthenticated = true;
          }
        }
        const syncStore = useSyncStore();
        await syncStore.refreshQueueCount();
        if (this.isAuthenticated) {
          void syncStore.triggerSync();
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

        const syncStore = useSyncStore();
        await syncStore.init();
        await syncStore.triggerSync();
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

        const syncStore = useSyncStore();
        syncStore.setUnauthenticated();
      } finally {
        this.isLoading = false;
      }
    },
  },
});
