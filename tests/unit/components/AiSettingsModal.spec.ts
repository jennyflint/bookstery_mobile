import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AiSettingsModal from '../../../app/components/ai/AiSettingsModal.vue';
import { useAiStore } from '../../../app/stores/aiStore';

describe('AiSettingsModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should not show delete key button when no API key is present', async () => {
    const store = useAiStore();
    store.settings.api_key = null;

    const wrapper = mount(AiSettingsModal, {
      props: {
        isOpen: true,
      },
      global: {
        mocks: {
          t: (key: string) => key,
        },
      },
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="delete-ai-key-btn"]').exists()).toBe(false);
  });

  it('should show delete key button when API key is configured and remove it on click', async () => {
    const store = useAiStore();
    store.isInitialized = true;
    store.settings.api_key = 'sk-test-secret-key-12345';

    const saveSettingsSpy = vi.spyOn(store, 'saveSettings').mockResolvedValue({
      ...store.settings,
      api_key: null,
      is_enabled: 0,
    });

    const wrapper = mount(AiSettingsModal, {
      props: {
        isOpen: true,
      },
      global: {
        mocks: {
          t: (key: string) => key,
        },
      },
    });

    await flushPromises();

    const deleteBtn = wrapper.find('[data-testid="delete-ai-key-btn"]');
    expect(deleteBtn.exists()).toBe(true);

    await deleteBtn.trigger('click');
    await flushPromises();

    expect(saveSettingsSpy).toHaveBeenCalledWith({
      api_key: null,
      is_enabled: 0,
    });

    const input = wrapper.find('[data-testid="ai-key-input"]').element as HTMLInputElement;
    expect(input.value).toBe('');
    expect(wrapper.find('[data-testid="delete-ai-key-btn"]').exists()).toBe(false);
  });

  it('should dynamically show delete button when user types a key and hide when cleared', async () => {
    const store = useAiStore();
    store.settings.api_key = null;

    const wrapper = mount(AiSettingsModal, {
      props: {
        isOpen: true,
      },
      global: {
        mocks: {
          t: (key: string) => key,
        },
      },
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="delete-ai-key-btn"]').exists()).toBe(false);

    const input = wrapper.find('[data-testid="ai-key-input"]');
    await input.setValue('sk-new-typed-key');
    await flushPromises();

    expect(wrapper.find('[data-testid="delete-ai-key-btn"]').exists()).toBe(true);

    const deleteBtn = wrapper.find('[data-testid="delete-ai-key-btn"]');
    await deleteBtn.trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="delete-ai-key-btn"]').exists()).toBe(false);
    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('should render modal dialog card with solid white background, gray borders, and shadow-xl', async () => {
    const wrapper = mount(AiSettingsModal, {
      props: {
        isOpen: true,
      },
      global: {
        mocks: {
          t: (key: string) => key,
        },
      },
    });

    await flushPromises();

    const backdrop = wrapper.find('.fixed.inset-0');
    expect(backdrop.classes()).toContain('bg-black/50');
    expect(backdrop.classes().some((c) => c.startsWith('backdrop-blur'))).toBe(false);

    const dialogCard = wrapper.find('.max-w-lg');
    expect(dialogCard.classes()).toContain('bg-white');
    expect(dialogCard.classes()).toContain('border-gray-200');
    expect(dialogCard.classes()).toContain('shadow-xl');
    expect(dialogCard.classes()).not.toContain('bg-[#F4ECD8]');

    const keyInput = wrapper.find('[data-testid="ai-key-input"]');
    expect(keyInput.classes()).toContain('bg-white');
    expect(keyInput.classes()).toContain('border-gray-300');
  });
});
