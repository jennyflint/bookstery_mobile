import { storeToRefs } from 'pinia';
import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const authStore = useAuthStore();
  const { user, isAuthenticated, isLoading } = storeToRefs(authStore);

  const initAuth = async (): Promise<void> => {
    await authStore.init();
  };

  const signIn = async (): Promise<void> => {
    await authStore.login();
  };

  const signOut = async (): Promise<void> => {
    await authStore.logout();
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    initAuth,
    signIn,
    signOut,
  };
}
