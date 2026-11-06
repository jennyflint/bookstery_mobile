import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import TranslationBottomSheet from '../../../app/components/translation/TranslationBottomSheet.vue';
import type { TranslationResult } from '../../../app/types';

describe('TranslationBottomSheet', () => {
  const mockResult: TranslationResult = {
    sourceText: 'This is a long source paragraph that needs to be translated into Ukrainian with proper vertical scrolling and wrapping.',
    translatedText: 'Це довгий вихідний абзац, який потрібно перекласти українською мовою з належним вертикальним прокручуванням та перенесенням рядків.',
    sourceLang: 'en',
    targetLang: 'uk',
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should not render when isOpen is false', async () => {
    const wrapper = mount(TranslationBottomSheet, {
      props: {
        isOpen: false,
        result: mockResult,
      },
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();
    expect(wrapper.find('[data-testid="open-google-translate-intent"]').exists()).toBe(false);
  });

  it('should have bounded flex column layout and scrollable containers when open', async () => {
    const wrapper = mount(TranslationBottomSheet, {
      props: {
        isOpen: true,
        result: mockResult,
      },
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    // Sheet container check
    const sheet = wrapper.find('.animate-in');
    expect(sheet.exists()).toBe(true);
    expect(sheet.classes()).toContain('flex');
    expect(sheet.classes()).toContain('flex-col');
    expect(sheet.classes()).toContain('max-h-[85vh]');

    // Header has shrink-0
    const header = wrapper.find('.border-b');
    expect(header.classes()).toContain('shrink-0');

    // Middle scrollable wrapper
    const scrollableWrapper = wrapper.find('.min-h-0.flex-1');
    expect(scrollableWrapper.exists()).toBe(true);
    expect(scrollableWrapper.classes()).toContain('overflow-y-auto');
    expect(scrollableWrapper.classes()).toContain('overscroll-contain');
    expect(scrollableWrapper.classes()).toContain('touch-pan-y');

    // Text boxes contain max-h and overflow-y-auto
    const sourceBox = wrapper.find('.max-h-36');
    expect(sourceBox.exists()).toBe(true);
    expect(sourceBox.classes()).toContain('overflow-y-auto');
    expect(sourceBox.classes()).toContain('overscroll-contain');
    expect(sourceBox.classes()).toContain('touch-pan-y');

    const translatedBox = wrapper.find('.max-h-56');
    expect(translatedBox.exists()).toBe(true);
    expect(translatedBox.classes()).toContain('overflow-y-auto');
    expect(translatedBox.classes()).toContain('overscroll-contain');
    expect(translatedBox.classes()).toContain('touch-pan-y');

    // Bottom action row has shrink-0
    const actionRow = wrapper.find('.pt-2');
    expect(actionRow.classes()).toContain('shrink-0');
  });
});
