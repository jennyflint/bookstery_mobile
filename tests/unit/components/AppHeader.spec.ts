import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { ref } from 'vue';
import AppHeader from '../../../app/components/layout/AppHeader.vue';

vi.mock('../../../app/composables/useCollectionNavigation', () => ({
  useCollectionNavigation: () => ({
    activeCollectionName: ref('My Collection'),
  }),
}));

vi.mock('../../../app/composables/useBookSync', () => ({
  useBookSync: () => ({
    isOnline: ref(true),
    isSyncing: ref(false),
    lastSyncAt: ref(Date.now()),
    syncVisualState: ref('idle'),
    syncNow: vi.fn(),
  }),
}));

describe('AppHeader Component', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should use gap-2 spacing and shrink-0 on logo container and SyncButton wrapper to prevent overlap', () => {
    const wrapper = mount(AppHeader, {
      global: {
        mocks: {
          t: (key: string) => key,
        },
        stubs: {
          AppLogo: true,
          NavigationDrawer: true,
          SyncStatusBadge: true,
          LanguageSwitcher: true,
        },
      },
    });

    const headerContainer = wrapper.find('header > div');
    expect(headerContainer.classes()).toContain('flex');
    expect(headerContainer.classes()).toContain('items-center');
    expect(headerContainer.classes()).toContain('justify-between');
    expect(headerContainer.classes()).toContain('gap-2');

    const logoContainer = wrapper.find('.logo-container, header > div > div:first-child');
    expect(logoContainer.classes()).toContain('shrink-0');
    expect(logoContainer.classes()).toContain('min-w-0');

    const syncButton = wrapper.find('[data-testid="sync-trigger-btn"]');
    expect(syncButton.exists()).toBe(true);
    expect(syncButton.classes()).toContain('shrink-0');

    const syncButtonWrapper = syncButton.element.parentElement;
    expect(syncButtonWrapper?.classList.contains('shrink-0')).toBe(true);
  });
});
