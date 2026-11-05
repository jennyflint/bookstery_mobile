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

  it('should highlight active Quick Endpoint preset button when selected', async () => {
    const store = useAiStore();
    store.settings.provider = 'custom';
    store.settings.base_url = '';

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

    // Click Custom provider button to ensure custom section is visible
    const providerBtns = wrapper.findAll('button');
    const customProviderBtn = providerBtns.find((b) => b.text().includes('Custom'));
    expect(customProviderBtn).toBeDefined();
    await customProviderBtn!.trigger('click');
    await flushPromises();

    const buttons = wrapper.findAll('button');
    const ollamaBtn = buttons.find((b) => b.text().includes('Ollama'));
    expect(ollamaBtn).toBeDefined();

    expect(ollamaBtn!.classes()).not.toContain('bg-[#3E5725]');

    await ollamaBtn!.trigger('click');
    await flushPromises();

    expect(ollamaBtn!.classes()).toContain('bg-[#3E5725]');
    expect(ollamaBtn!.classes()).toContain('text-white');
    expect(ollamaBtn!.classes()).toContain('border-[#3E5725]');
  });

  it('should highlight selected fetched model button', async () => {
    const store = useAiStore();
    store.settings.provider = 'custom';
    store.settings.base_url = 'http://localhost:11434/v1';

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

    const vm = wrapper.vm as unknown as { fetchedModels: string[] };
    vm.fetchedModels = ['llama3.2', 'mistral'];
    await wrapper.vm.$nextTick();

    const buttons = wrapper.findAll('button');
    const llamaBtn = buttons.find((b) => b.text().trim() === 'llama3.2');
    const mistralBtn = buttons.find((b) => b.text().trim() === 'mistral');

    expect(llamaBtn).toBeDefined();
    expect(mistralBtn).toBeDefined();

    await llamaBtn!.trigger('click');
    await wrapper.vm.$nextTick();

    expect(llamaBtn!.classes()).toContain('bg-[#3E5725]');
    expect(llamaBtn!.classes()).toContain('text-white');
    expect(mistralBtn!.classes()).not.toContain('bg-[#3E5725]');

    await mistralBtn!.trigger('click');
    await wrapper.vm.$nextTick();

    expect(mistralBtn!.classes()).toContain('bg-[#3E5725]');
    expect(mistralBtn!.classes()).toContain('text-white');
    expect(llamaBtn!.classes()).not.toContain('bg-[#3E5725]');
  });
});
