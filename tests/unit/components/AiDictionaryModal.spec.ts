import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AiDictionaryModal from '../../../app/components/ai/AiDictionaryModal.vue';
import { useAiStore } from '../../../app/stores/aiStore';
import { useDictionaryStore } from '../../../app/stores/dictionaryStore';
import type { DictionaryEntry } from '../../../app/types';

describe('AiDictionaryModal', () => {
  const mockEntry: DictionaryEntry = {
    word: 'resilience',
    lemma: 'resilience',
    partOfSpeech: 'noun',
    phonetic: '/rɪˈzɪliəns/',
    translation: 'стійкість, життєстійкість',
    contextualDefinition: 'здатність відновлюватися після важких випробувань',
    generalDefinition: 'властивість матеріалу або характеру відновлювати початкову форму',
    synonyms: ['endurance', 'toughness', 'flexibility'],
    exampleSentence: 'Her resilience inspired everyone in the community.',
    contextSentence: 'In times of adversity, resilience becomes our greatest asset.',
    bookTitle: 'Man\'s Search for Meaning',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should not render modal when isDictionaryModalOpen is false', async () => {
    const aiStore = useAiStore();
    aiStore.isDictionaryModalOpen = false;

    const wrapper = mount(AiDictionaryModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();
    expect(wrapper.find('[data-testid="ai-dictionary-modal"]').exists()).toBe(false);
  });

  it('should render modal with solid white background, max-w-lg, and shadow-2xl when open', async () => {
    const aiStore = useAiStore();
    aiStore.isDictionaryModalOpen = true;

    const wrapper = mount(AiDictionaryModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const modal = wrapper.find('[data-testid="ai-dictionary-modal"]');
    expect(modal.exists()).toBe(true);
    expect(modal.classes()).toContain('bg-white');
    expect(modal.classes()).toContain('border-gray-200');
    expect(modal.classes()).toContain('max-w-lg');
    expect(modal.classes()).toContain('shadow-2xl');
  });

  it('should close modal when close button is clicked', async () => {
    const aiStore = useAiStore();
    aiStore.isDictionaryModalOpen = true;
    const closeSpy = vi.spyOn(aiStore, 'closeDictionaryModal');

    const wrapper = mount(AiDictionaryModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const closeBtn = wrapper.find('[data-testid="close-dictionary-btn"]');
    expect(closeBtn.exists()).toBe(true);

    await closeBtn.trigger('click');
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('should render loading spinner when isDictionaryLoading is true', async () => {
    const aiStore = useAiStore();
    aiStore.isDictionaryModalOpen = true;
    aiStore.isDictionaryLoading = true;

    const wrapper = mount(AiDictionaryModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="dictionary-loading-spinner"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('ai.analyzingWordInContext');
  });

  it('should render error message banner when dictionaryError is set', async () => {
    const aiStore = useAiStore();
    aiStore.isDictionaryModalOpen = true;
    aiStore.isDictionaryLoading = false;
    aiStore.dictionaryError = 'Network connection failed';

    const wrapper = mount(AiDictionaryModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const errorBanner = wrapper.find('[data-testid="dictionary-error-banner"]');
    expect(errorBanner.exists()).toBe(true);
    expect(errorBanner.text()).toContain('Network connection failed');
  });

  it('should render structured breakdown fields when dictionaryEntry is available', async () => {
    const aiStore = useAiStore();
    aiStore.isDictionaryModalOpen = true;
    aiStore.isDictionaryLoading = false;
    aiStore.dictionaryEntry = mockEntry;

    const wrapper = mount(AiDictionaryModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('resilience');
    expect(wrapper.text()).toContain('/rɪˈzɪliəns/');
    expect(wrapper.text()).toContain('noun');
    expect(wrapper.text()).toContain('стійкість, життєстійкість');
    expect(wrapper.text()).toContain('здатність відновлюватися після важких випробувань');
    expect(wrapper.text()).toContain('In times of adversity, resilience becomes our greatest asset.');
    expect(wrapper.text()).toContain('endurance');
    expect(wrapper.text()).toContain('toughness');
    expect(wrapper.text()).toContain('Her resilience inspired everyone in the community.');
  });

  it('should save word to vocabulary and refresh dictionaryStore when save button is clicked', async () => {
    const aiStore = useAiStore();
    aiStore.isDictionaryModalOpen = true;
    aiStore.isDictionaryLoading = false;
    aiStore.dictionaryEntry = mockEntry;
    aiStore.isSavedToVocabulary = false;

    const dictionaryStore = useDictionaryStore();

    const saveSpy = vi.spyOn(aiStore, 'saveCurrentWordToVocabulary').mockResolvedValue();
    const refreshSpy = vi.spyOn(dictionaryStore, 'loadVocabulary').mockResolvedValue();

    const wrapper = mount(AiDictionaryModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const saveBtn = wrapper.find('[data-testid="save-to-vocabulary-btn"]');
    expect(saveBtn.exists()).toBe(true);
    expect((saveBtn.element as HTMLButtonElement).disabled).toBe(false);

    await saveBtn.trigger('click');
    await flushPromises();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('should disable save button and show saved state when isSavedToVocabulary is true', async () => {
    const aiStore = useAiStore();
    aiStore.isDictionaryModalOpen = true;
    aiStore.isDictionaryLoading = false;
    aiStore.dictionaryEntry = mockEntry;
    aiStore.isSavedToVocabulary = true;

    const wrapper = mount(AiDictionaryModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const saveBtn = wrapper.find('[data-testid="save-to-vocabulary-btn"]');
    expect((saveBtn.element as HTMLButtonElement).disabled).toBe(true);
    expect(wrapper.text()).toContain('ai.savedToVocabulary');
  });

  it('should call copyChatMessage when copy button is clicked', async () => {
    const aiStore = useAiStore();
    aiStore.isDictionaryModalOpen = true;
    aiStore.isDictionaryLoading = false;
    aiStore.dictionaryEntry = mockEntry;

    const copySpy = vi.spyOn(aiStore, 'copyChatMessage').mockResolvedValue(true);

    const wrapper = mount(AiDictionaryModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const copyBtn = wrapper.find('[data-testid="copy-dictionary-btn"]');
    expect(copyBtn.exists()).toBe(true);

    await copyBtn.trigger('click');
    await flushPromises();

    expect(copySpy).toHaveBeenCalledWith(
      expect.stringContaining('resilience — стійкість, життєстійкість'),
    );
  });

  it('should have proper shrink-0 headers/footers and scrollable container with word wrapping', async () => {
    const aiStore = useAiStore();
    aiStore.isDictionaryModalOpen = true;
    aiStore.isDictionaryLoading = false;
    aiStore.dictionaryEntry = mockEntry;

    const wrapper = mount(AiDictionaryModal, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    // Header has shrink-0
    const header = wrapper.find('header');
    expect(header.classes()).toContain('shrink-0');

    // Scrollable container
    const contentArea = wrapper.find('.min-h-0.flex-1');
    expect(contentArea.exists()).toBe(true);
    expect(contentArea.classes()).toContain('overflow-y-auto');
    expect(contentArea.classes()).toContain('overscroll-contain');
    expect(contentArea.classes()).toContain('touch-pan-y');

    // Text wrapping
    const translationText = wrapper.find('.text-teal-900');
    expect(translationText.classes()).toContain('break-words');
    expect(translationText.classes()).toContain('whitespace-pre-wrap');

    const contextualDef = wrapper.find('.text-gray-800');
    expect(contextualDef.classes()).toContain('break-words');
    expect(contextualDef.classes()).toContain('whitespace-pre-wrap');

    const contextSentence = wrapper.find('.italic');
    expect(contextSentence.classes()).toContain('break-words');
    expect(contextSentence.classes()).toContain('whitespace-pre-wrap');

    // Footer has shrink-0
    const footer = wrapper.find('footer');
    expect(footer.classes()).toContain('shrink-0');
  });
});
