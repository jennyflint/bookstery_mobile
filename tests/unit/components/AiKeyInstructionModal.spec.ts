import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AiKeyInstructionModal from '../../../app/components/ai/AiKeyInstructionModal.vue';
import { useAiStore } from '../../../app/stores/aiStore';

describe('AiKeyInstructionModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should render modal with solid white background, max-w-md, and shadow-2xl', async () => {
    const wrapper = mount(AiKeyInstructionModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const modal = wrapper.find('[data-testid="ai-key-instruction-modal"]');
    expect(modal.exists()).toBe(true);
    expect(modal.classes()).toContain('bg-white');
    expect(modal.classes()).toContain('border-gray-200');
    expect(modal.classes()).toContain('max-w-md');
    expect(modal.classes()).toContain('shadow-2xl');
  });

  it('should display the 3 instruction steps and privacy reassurance', async () => {
    const wrapper = mount(AiKeyInstructionModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('ai.instructionStep1Title');
    expect(wrapper.text()).toContain('ai.instructionStep2Title');
    expect(wrapper.text()).toContain('ai.instructionStep3Title');
    expect(wrapper.text()).toContain('ai.instructionPrivacyNote');
  });

  it('should call aiStore.openSettingsModal and emit open-settings when configure key button is clicked', async () => {
    const aiStore = useAiStore();
    const openSettingsSpy = vi.spyOn(aiStore, 'openSettingsModal');

    const wrapper = mount(AiKeyInstructionModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const connectBtn = wrapper.find('[data-testid="instruction-connect-key-btn"]');
    expect(connectBtn.exists()).toBe(true);

    await connectBtn.trigger('click');
    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('open-settings')).toBeTruthy();
  });

  it('should call aiStore.closeOnboardingModal and emit close when close buttons are clicked', async () => {
    const aiStore = useAiStore();
    const closeSpy = vi.spyOn(aiStore, 'closeOnboardingModal');

    const wrapper = mount(AiKeyInstructionModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const closeBtn = wrapper.find('[data-testid="instruction-close-btn"]');
    expect(closeBtn.exists()).toBe(true);

    await closeBtn.trigger('click');
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('close')).toBeTruthy();

    const xBtn = wrapper.find('[data-testid="instruction-close-x-btn"]');
    await xBtn.trigger('click');
    expect(closeSpy).toHaveBeenCalledTimes(2);
  });
});
