import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import SyncButton from '../../../app/components/common/SyncButton.vue';
import ukLocale from '../../../i18n/locales/uk.json';
import enLocale from '../../../i18n/locales/en.json';

const mockUseBookSync = vi.fn();

vi.mock('../../../app/composables/useBookSync', () => ({
  useBookSync: () => mockUseBookSync(),
}));

describe('SyncButton Component', () => {
  const originalUseI18n = (globalThis as unknown as { useI18n: unknown }).useI18n;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    (globalThis as unknown as { useI18n: unknown }).useI18n = originalUseI18n;
  });

  it('should render "sync on" when sync is active and online in English', () => {
    (globalThis as unknown as { useI18n: () => { t: (k: string) => string } }).useI18n = () => ({
      t: (key: string) => {
        if (key === 'sync.online') return enLocale.sync.online;
        if (key === 'sync.offline') return enLocale.sync.offline;
        return key;
      },
    });

    mockUseBookSync.mockReturnValue({
      isOnline: ref(true),
      isSyncing: ref(false),
      lastSyncAt: ref(Date.now()),
      syncVisualState: ref('idle'),
      syncNow: vi.fn(),
    });

    const wrapper = mount(SyncButton);

    expect(wrapper.text()).toBe('sync on');
    expect(wrapper.find('svg path[d*="M3 3l18 18"]').exists()).toBe(false);
  });

  it('should render "sync off" when unauthenticated or offline in English', () => {
    (globalThis as unknown as { useI18n: () => { t: (k: string) => string } }).useI18n = () => ({
      t: (key: string) => {
        if (key === 'sync.online') return enLocale.sync.online;
        if (key === 'sync.offline') return enLocale.sync.offline;
        return key;
      },
    });

    mockUseBookSync.mockReturnValue({
      isOnline: ref(true),
      isSyncing: ref(false),
      lastSyncAt: ref(null),
      syncVisualState: ref('unauthenticated'),
      syncNow: vi.fn(),
    });

    const wrapper = mount(SyncButton);

    expect(wrapper.text()).toBe('sync off');
    expect(wrapper.find('svg').exists()).toBe(false);
  });

  it('should render strictly "sync on" or "sync off" in Ukrainian locale', () => {
    expect(ukLocale.sync.online).toBe('sync on');
    expect(ukLocale.sync.offline).toBe('sync off');

    (globalThis as unknown as { useI18n: () => { t: (k: string) => string } }).useI18n = () => ({
      t: (key: string) => {
        if (key === 'sync.online') return ukLocale.sync.online;
        if (key === 'sync.offline') return ukLocale.sync.offline;
        return key;
      },
    });

    // Test sync off in uk
    mockUseBookSync.mockReturnValue({
      isOnline: ref(true),
      isSyncing: ref(false),
      lastSyncAt: ref(null),
      syncVisualState: ref('unauthenticated'),
      syncNow: vi.fn(),
    });

    let wrapper = mount(SyncButton);
    expect(wrapper.text()).toBe('sync off');

    // Test sync on in uk
    mockUseBookSync.mockReturnValue({
      isOnline: ref(true),
      isSyncing: ref(false),
      lastSyncAt: ref(Date.now()),
      syncVisualState: ref('idle'),
      syncNow: vi.fn(),
    });

    wrapper = mount(SyncButton);
    expect(wrapper.text()).toBe('sync on');
  });

  it('should have compact pill/badge styling classes', () => {
    (globalThis as unknown as { useI18n: () => { t: (k: string) => string } }).useI18n = () => ({
      t: (key: string) => (key === 'sync.online' ? 'sync on' : 'sync off'),
    });

    mockUseBookSync.mockReturnValue({
      isOnline: ref(true),
      isSyncing: ref(false),
      lastSyncAt: ref(Date.now()),
      syncVisualState: ref('idle'),
      syncNow: vi.fn(),
    });

    const wrapper = mount(SyncButton);

    const btn = wrapper.find('[data-testid="sync-trigger-btn"]');
    expect(btn.classes()).toContain('whitespace-nowrap');
    expect(btn.classes()).toContain('shrink-0');
    expect(btn.classes()).toContain('text-xs');
    expect(btn.classes()).toContain('font-medium');
    expect(btn.classes()).toContain('px-2.5');
    expect(btn.classes()).toContain('py-1');
    expect(btn.classes()).toContain('rounded-full');
  });

  it('should not contain any cloud icons in template across any state', () => {
    (globalThis as unknown as { useI18n: () => { t: (k: string) => string } }).useI18n = () => ({
      t: (key: string) => (key === 'sync.online' ? 'sync on' : 'sync off'),
    });

    const states = ['idle', 'unauthenticated', 'offline', 'error', 'success'];

    for (const state of states) {
      mockUseBookSync.mockReturnValue({
        isOnline: ref(state !== 'offline'),
        isSyncing: ref(false),
        lastSyncAt: ref(null),
        syncVisualState: ref(state),
        syncNow: vi.fn(),
      });

      const wrapper = mount(SyncButton);

      const svg = wrapper.find('svg');
      if (svg.exists()) {
        const path = svg.find('path');
        const d = path.attributes('d') || '';
        expect(d).not.toContain('M3 15a4 4 0 004 4h9');
        expect(d).not.toContain('M3 3l18 18');
      }
    }
  });
});
