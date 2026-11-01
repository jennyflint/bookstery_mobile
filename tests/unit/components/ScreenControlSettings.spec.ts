import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ScreenControlSettings from '~/components/settings/ScreenControlSettings.vue';
import { useSettingsStore } from '~/stores/useSettingsStore';
import { useReaderStore } from '~/stores/readerStore';
import { ScreenControlService } from '~/services/ScreenControlService';

describe('ScreenControlSettings.vue', () => {
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

  const mountComponent = (props = {}) => {
    return mount(ScreenControlSettings, {
      props,
      global: {
        plugins: [pinia],
        mocks: {
          $t: (key: string) => key,
        },
      },
    });
  };

  it('renders correctly with default settings', () => {
    const wrapper = mountComponent();
    expect(wrapper.find('[data-testid="screen-control-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="keep-screen-awake-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="orientation-auto-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="orientation-portrait-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="orientation-landscape-btn"]').exists()).toBe(true);
  });

  it('toggles keepScreenAwake state when switch is clicked', async () => {
    const settingsStore = useSettingsStore();
    const readerStore = useReaderStore();
    const wrapper = mountComponent();

    expect(settingsStore.keepScreenAwake).toBe(true);

    const toggle = wrapper.find('[data-testid="keep-screen-awake-toggle"]');
    await toggle.trigger('click');

    expect(settingsStore.keepScreenAwake).toBe(false);
    expect(readerStore.settings.keepScreenAwake).toBe(false);

    await toggle.trigger('click');
    expect(settingsStore.keepScreenAwake).toBe(true);
    expect(readerStore.settings.keepScreenAwake).toBe(true);
  });

  it('changes orientation mode when segmented buttons are clicked', async () => {
    const settingsStore = useSettingsStore();
    const readerStore = useReaderStore();
    const wrapper = mountComponent();

    const portraitBtn = wrapper.find('[data-testid="orientation-portrait-btn"]');
    await portraitBtn.trigger('click');

    expect(settingsStore.orientationLock).toBe('portrait');
    expect(readerStore.settings.orientationLock).toBe('portrait');

    const landscapeBtn = wrapper.find('[data-testid="orientation-landscape-btn"]');
    await landscapeBtn.trigger('click');

    expect(settingsStore.orientationLock).toBe('landscape');
    expect(readerStore.settings.orientationLock).toBe('landscape');

    const autoBtn = wrapper.find('[data-testid="orientation-auto-btn"]');
    await autoBtn.trigger('click');

    expect(settingsStore.orientationLock).toBe('auto');
    expect(readerStore.settings.orientationLock).toBe('auto');
  });

  it('applies compact layout when compact prop is true', () => {
    const wrapper = mountComponent({ compact: true });
    const section = wrapper.find('[data-testid="screen-control-settings"]');
    expect(section.classes()).toContain('rounded-2xl');
  });
});
