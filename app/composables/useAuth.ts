import { storeToRefs } from 'pinia';
import { useAuthStore } from '../stores/authStore';
import { SqliteService } from '../services/database/SqliteService';
import { SyncQueueService } from '../services/sync/SyncQueueService';

export function useAuth() {
  const authStore = useAuthStore();
  const { user, isAuthenticated, isLoading } = storeToRefs(authStore);

  const initAuth = async (): Promise<void> => {
    await authStore.init();
  };

  const signIn = async (): Promise<void> => {
    await authStore.login();
  };

  const checkPendingSyncBeforeSignOut = async (): Promise<number> => {
    const sqlite = SqliteService.getInstance();
    const pending = await sqlite.getPendingSyncQueue();
    return pending.length;
  };

  const attemptFlushBeforeSignOut = async (): Promise<boolean> => {
    try {
      const queueService = SyncQueueService.getInstance();
      if (queueService.getIsOnline()) {
        await queueService.flushPending();
        const pending = await checkPendingSyncBeforeSignOut();
        return pending === 0;
      }
      return false;
    } catch {
      return false;
    }
  };

  const signOut = async (
    force: boolean = false,
  ): Promise<{ needsConfirmation: boolean; pendingCount: number }> => {
    const pendingCount = await checkPendingSyncBeforeSignOut();
    if (pendingCount > 0 && !force) {
      const flushed = await attemptFlushBeforeSignOut();
      if (!flushed) {
        const remaining = await checkPendingSyncBeforeSignOut();
        return { needsConfirmation: true, pendingCount: remaining };
      }
    }
    await authStore.logout();
    return { needsConfirmation: false, pendingCount: 0 };
  };

  const forceSignOut = async (): Promise<void> => {
    await authStore.logout();
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    initAuth,
    signIn,
    signOut,
    forceSignOut,
    checkPendingSyncBeforeSignOut,
  };
}
