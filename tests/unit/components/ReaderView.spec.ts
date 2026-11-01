import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ReaderView from '~/components/reader/ReaderView.vue';
import { useSettingsStore } from '~/stores/useSettingsStore';
import { useTtsStore } from '~/stores/ttsStore';

describe('ReaderView.vue', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls settingsStore.enterReader on mount and leaveReader on unmount', async () => {
    const settingsStore = useSettingsStore();
    const ttsStore = useTtsStore();

    const enterSpy = vi.spyOn(settingsStore, 'enterReader').mockResolvedValue(undefined);
    const leaveSpy = vi.spyOn(settingsStore, 'leaveReader').mockResolvedValue(undefined);

    const wrapper = mount(ReaderView, {
      global: {
        plugins: [pinia],
        stubs: {
          ReaderViewport: true,
        },
      },
    });

    expect(enterSpy).toHaveBeenCalledTimes(1);

    wrapper.unmount();

    expect(leaveSpy).toHaveBeenCalledWith(false);
  });
});
