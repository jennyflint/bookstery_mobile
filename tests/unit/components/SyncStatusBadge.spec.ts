import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SyncStatusBadge from '../../../app/components/common/SyncStatusBadge.vue';
import { useAuthStore } from '../../../app/stores/authStore';
import { useSyncStore } from '../../../app/stores/syncStore';
import { GoogleAuthService } from '../../../app/services/auth/GoogleAuthService';

describe('SyncStatusBadge Component', () => {
  const originalUseI18n = (globalThis as unknown as { useI18n: unknown }).useI18n;

  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    await GoogleAuthService.getInstance().signOut();

    (globalThis as unknown as { useI18n: () => { t: (k: string) => string } }).useI18n = () => ({
      t: (key: string) => {
        if (key === 'sync.offline') return 'sync off';
        if (key === 'sync.synced') return 'sync on';
        return key;
      },
    });
  });

  afterEach(() => {
    (globalThis as unknown as { useI18n: unknown }).useI18n = originalUseI18n;
  });

  it('displays "sync off" when unauthenticated, and switches to synced state upon login', async () => {
    const wrapper = mount(SyncStatusBadge, {
      global: {
        mocks: {
          t: (key: string) => {
            if (key === 'sync.offline') return 'sync off';
            if (key === 'sync.synced') return 'sync on';
            return key;
          },
        },
      },
    });

    const authStore = useAuthStore();
    const syncStore = useSyncStore();
    await syncStore.init();

    // Initial unauthenticated state
    expect(authStore.isAuthenticated).toBe(false);
    expect(wrapper.text()).toBe('sync off');

    // Trigger login
    await authStore.login();
    await wrapper.vm.$nextTick();

    expect(authStore.isAuthenticated).toBe(true);
    // After login, SyncStatusBadge switches from Sync off to Sync on
    expect(wrapper.text()).toBe('sync on');
  });
});
