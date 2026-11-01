import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import DictionaryPage from '../../../app/pages/dictionary.vue';
import { useDictionaryStore } from '../../../app/stores/dictionaryStore';

describe('DictionaryPage', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('renders single vocabulary view without any tab buttons', async () => {
    const store = useDictionaryStore();
    vi.spyOn(store, 'loadAll').mockImplementation(async () => {});
    store.vocabularyWords = [
      {
        id: 1,
        book_id: 'book-1',
        book_title: 'The Great Gatsby',
        word: 'serendipity',
        lemma: null,
        part_of_speech: 'noun',
        phonetic: '/ˌser.ənˈdɪp.ə.ti/',
        translation: 'інтуїтивна прозорливість',
        contextual_definition: 'щасливий випадок',
        general_definition: null,
        synonyms_json: null,
        example_sentence: null,
        context_sentence: 'It was sheer serendipity that they met.',
        created_at: Date.now(),
      },
    ];

    const wrapper = mount(DictionaryPage, {
      global: {
        stubs: {
          NuxtLink: {
            template: '<a><slot /></a>',
          },
          LanguageSwitcher: {
            template: '<div data-testid="language-switcher" />',
          },
        },
        mocks: {
          t: (key: string) => key,
        },
      },
    });

    await flushPromises();

    // Verify there are NO tab switch buttons
    expect(wrapper.find('[data-testid="vocab-tab-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="history-tab-btn"]').exists()).toBe(false);

    // Verify vocabulary card is rendered
    const card = wrapper.find('[data-testid="vocabulary-card"]');
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain('serendipity');
    expect(card.text()).toContain('інтуїтивна прозорливість');
    expect(card.text()).toContain('щасливий випадок');
    expect(card.text()).toContain('The Great Gatsby');
  });

  it('allows searching vocabulary words', async () => {
    const store = useDictionaryStore();
    vi.spyOn(store, 'loadAll').mockImplementation(async () => {});
    store.vocabularyWords = [
      {
        id: 1,
        book_id: null,
        book_title: null,
        word: 'courage',
        lemma: null,
        part_of_speech: null,
        phonetic: null,
        translation: 'мужність',
        contextual_definition: 'мужність',
        general_definition: null,
        synonyms_json: null,
        example_sentence: null,
        context_sentence: null,
        created_at: Date.now(),
      },
      {
        id: 2,
        book_id: null,
        book_title: null,
        word: 'wisdom',
        lemma: null,
        part_of_speech: null,
        phonetic: null,
        translation: 'мудрість',
        contextual_definition: 'мудрість',
        general_definition: null,
        synonyms_json: null,
        example_sentence: null,
        context_sentence: null,
        created_at: Date.now(),
      },
    ];

    const wrapper = mount(DictionaryPage, {
      global: {
        stubs: {
          NuxtLink: { template: '<a><slot /></a>' },
          LanguageSwitcher: { template: '<div />' },
        },
        mocks: {
          t: (key: string) => key,
        },
      },
    });

    await flushPromises();

    const searchInput = wrapper.find('[data-testid="vocab-search-input"]');
    expect(searchInput.exists()).toBe(true);

    await searchInput.setValue('wisdom');
    await flushPromises();

    const cards = wrapper.findAll('[data-testid="vocabulary-card"]');
    expect(cards).toHaveLength(1);
    expect(cards[0].text()).toContain('wisdom');
  });

  it('handles word deletion', async () => {
    const store = useDictionaryStore();
    vi.spyOn(store, 'loadAll').mockImplementation(async () => {});
    store.vocabularyWords = [
      {
        id: 42,
        book_id: null,
        book_title: null,
        word: 'deleteMe',
        lemma: null,
        part_of_speech: null,
        phonetic: null,
        translation: 'видалиМене',
        contextual_definition: 'видалиМене',
        general_definition: null,
        synonyms_json: null,
        example_sentence: null,
        context_sentence: null,
        created_at: Date.now(),
      },
    ];

    const deleteSpy = vi.spyOn(store, 'deleteVocabularyWord').mockResolvedValue();

    const wrapper = mount(DictionaryPage, {
      global: {
        stubs: {
          NuxtLink: { template: '<a><slot /></a>' },
          LanguageSwitcher: { template: '<div />' },
        },
        mocks: {
          t: (key: string) => key,
        },
      },
    });

    await flushPromises();

    const deleteBtn = wrapper.find('button[title="dictionary.delete"]');
    expect(deleteBtn.exists()).toBe(true);

    await deleteBtn.trigger('click');
    expect(deleteSpy).toHaveBeenCalledWith(42);
  });
});
