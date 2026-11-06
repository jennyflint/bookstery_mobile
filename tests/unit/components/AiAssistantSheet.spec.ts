import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AiAssistantSheet from '../../../app/components/ai/AiAssistantSheet.vue';
import { useAiStore } from '../../../app/stores/aiStore';

describe('AiAssistantSheet', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should not render sheet when isSheetOpen is false', async () => {
    const aiStore = useAiStore();
    aiStore.isSheetOpen = false;

    const wrapper = mount(AiAssistantSheet, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();
    expect(wrapper.find('[data-testid="dismiss-ai-sheet-btn"]').exists()).toBe(false);
  });

  it('should have bounded flex column layout, shrink-0 header/footer, and scrollable body when open', async () => {
    const aiStore = useAiStore();
    aiStore.isSheetOpen = true;
    aiStore.currentOutput = 'This is an AI generated response.';

    const wrapper = mount(AiAssistantSheet, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    // Sheet container
    const sheet = wrapper.find('.fixed.bottom-0');
    expect(sheet.exists()).toBe(true);
    expect(sheet.classes()).toContain('flex');
    expect(sheet.classes()).toContain('flex-col');
    expect(sheet.classes()).toContain('max-h-[85vh]');

    // Header has shrink-0
    const header = wrapper.find('.border-b');
    expect(header.classes()).toContain('shrink-0');

    // Scrollable body
    const body = wrapper.find('.min-h-0.flex-1');
    expect(body.exists()).toBe(true);
    expect(body.classes()).toContain('overflow-y-auto');
    expect(body.classes()).toContain('overscroll-contain');
    expect(body.classes()).toContain('touch-pan-y');

    // Footer has shrink-0
    const footer = wrapper.find('[data-testid="regenerate-ai-btn"]').element.closest('div');
    expect(footer?.classList.contains('shrink-0')).toBe(true);
  });
});
