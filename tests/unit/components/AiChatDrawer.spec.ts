import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AiChatDrawer from '../../../app/components/ai/AiChatDrawer.vue';
import { useAiStore } from '../../../app/stores/aiStore';
import { useReaderStore } from '../../../app/stores/readerStore';
import type { Book } from '../../../app/types';

describe('AiChatDrawer', () => {
  const mockBook: Book = {
    id: 'book-123',
    title: 'Solaris',
    author: 'Stanislaw Lem',
    file_path: '/books/solaris.epub',
    format: 'epub',
    locator: '1',
    progress_percentage: 0,
    total_items: 100,
    last_read_at: Date.now(),
    cover_path: null,
    file_size: 1024,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should not render drawer elements when isChatDrawerOpen is false', async () => {
    const aiStore = useAiStore();
    aiStore.isChatDrawerOpen = false;

    const wrapper = mount(AiChatDrawer, {
      props: {
        pageText: 'Page text context',
      },
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();
    expect(wrapper.find('[data-testid="ai-chat-drawer"]').exists()).toBe(false);
  });

  it('should render drawer with solid white background and gray borders when open', async () => {
    const aiStore = useAiStore();
    aiStore.isChatDrawerOpen = true;

    const readerStore = useReaderStore();
    readerStore.currentBook = mockBook;

    const wrapper = mount(AiChatDrawer, {
      props: {
        pageText: 'Page text context',
      },
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const drawer = wrapper.find('[data-testid="ai-chat-drawer"]');
    expect(drawer.exists()).toBe(true);
    expect(drawer.classes()).toContain('bg-white');
    expect(drawer.classes()).toContain('border-gray-200');
    expect(drawer.classes()).toContain('text-gray-900');
    expect(drawer.text()).toContain('Solaris');
  });

  it('should close drawer when close button is clicked', async () => {
    const aiStore = useAiStore();
    aiStore.isChatDrawerOpen = true;
    const closeSpy = vi.spyOn(aiStore, 'closeChat');

    const wrapper = mount(AiChatDrawer, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const closeBtn = wrapper.find('[data-testid="close-chat-btn"]');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('should render empty state welcome message when chatMessages is empty', async () => {
    const aiStore = useAiStore();
    aiStore.isChatDrawerOpen = true;
    aiStore.chatMessages = [];

    const wrapper = mount(AiChatDrawer, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('ai.chatWelcome');
  });

  it('should render user and assistant messages with markdown formatted output', async () => {
    const aiStore = useAiStore();
    aiStore.isChatDrawerOpen = true;
    aiStore.chatMessages = [
      {
        id: 'msg-1',
        bookId: 'book-123',
        role: 'user',
        content: 'Tell me about the ocean',
        createdAt: 1000,
      },
      {
        id: 'msg-2',
        bookId: 'book-123',
        role: 'assistant',
        content: 'The **Solaris ocean** is a living entity.',
        createdAt: 1001,
      },
    ];

    const wrapper = mount(AiChatDrawer, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('Tell me about the ocean');
    expect(wrapper.html()).toContain('<strong>Solaris ocean</strong>');
  });

  it('should dispatch sendChatMessage and clear input when send button is clicked', async () => {
    const aiStore = useAiStore();
    aiStore.isChatDrawerOpen = true;

    const readerStore = useReaderStore();
    readerStore.currentBook = mockBook;
    readerStore.currentPage = 15;

    const sendSpy = vi.spyOn(aiStore, 'sendChatMessage').mockResolvedValue();

    const wrapper = mount(AiChatDrawer, {
      props: {
        pageText: 'Current chapter page text',
      },
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const input = wrapper.find('[data-testid="ai-chat-input"]');
    await input.setValue('Who is Kelvin?');
    await flushPromises();

    const sendBtn = wrapper.find('[data-testid="send-chat-btn"]');
    expect((sendBtn.element as HTMLButtonElement).disabled).toBe(false);

    await sendBtn.trigger('click');
    await flushPromises();

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userText: 'Who is Kelvin?',
        bookTitle: 'Solaris',
        author: 'Stanislaw Lem',
        currentPage: 15,
        pageContext: 'Current chapter page text',
      }),
    );

    expect((input.element as HTMLTextAreaElement).value).toBe('');
  });

  it('should trigger sendChatMessage when quick preset prompt chip is clicked', async () => {
    const aiStore = useAiStore();
    aiStore.isChatDrawerOpen = true;
    aiStore.customQuickPrompts = [
      { id: 'preset-1', title: 'Summarize', prompt: 'Summarize the current page.' },
    ];

    const readerStore = useReaderStore();
    readerStore.currentBook = mockBook;

    const sendSpy = vi.spyOn(aiStore, 'sendChatMessage').mockResolvedValue();

    const wrapper = mount(AiChatDrawer, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const presetBtn = wrapper.findAll('footer button').find((b) => b.text().includes('Summarize'));
    expect(presetBtn).toBeDefined();

    await presetBtn!.trigger('click');
    await flushPromises();

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userText: 'Summarize the current page.',
        bookTitle: 'Solaris',
      }),
    );
  });

  it('should render abort button and call abortChatStream when isChatStreaming is true', async () => {
    const aiStore = useAiStore();
    aiStore.isChatDrawerOpen = true;
    aiStore.isChatStreaming = true;

    const abortSpy = vi.spyOn(aiStore, 'abortChatStream');

    const wrapper = mount(AiChatDrawer, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const abortBtn = wrapper.find('[data-testid="abort-chat-btn"]');
    expect(abortBtn.exists()).toBe(true);
    expect(wrapper.find('[data-testid="send-chat-btn"]').exists()).toBe(false);

    await abortBtn.trigger('click');
    expect(abortSpy).toHaveBeenCalledTimes(1);
  });

  it('should display attached selection snippet and allow clearing it', async () => {
    const aiStore = useAiStore();
    aiStore.isChatDrawerOpen = true;
    aiStore.attachedSelection = 'Important quote from chapter 1';

    const clearSelectionSpy = vi.spyOn(aiStore, 'setAttachedSelection');

    const wrapper = mount(AiChatDrawer, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('Important quote from chapter 1');

    const dismissBtn = wrapper.find('.rounded-full button');
    await dismissBtn.trigger('click');

    expect(clearSelectionSpy).toHaveBeenCalledWith(null);
  });

  it('should call clearChatHistory when clear chat button is clicked', async () => {
    const aiStore = useAiStore();
    aiStore.isChatDrawerOpen = true;
    aiStore.chatMessages = [
      {
        id: 'msg-1',
        bookId: 'book-123',
        role: 'user',
        content: 'Hi',
        createdAt: 1000,
      },
    ];

    const readerStore = useReaderStore();
    readerStore.currentBook = mockBook;

    const clearSpy = vi.spyOn(aiStore, 'clearChatHistory').mockResolvedValue();

    const wrapper = mount(AiChatDrawer, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const clearBtn = wrapper.find('[data-testid="clear-chat-btn"]');
    expect(clearBtn.exists()).toBe(true);

    await clearBtn.trigger('click');
    expect(clearSpy).toHaveBeenCalledWith('book-123');
  });

  it('should display error banner when chatError is set and allow regenerate', async () => {
    const aiStore = useAiStore();
    aiStore.isChatDrawerOpen = true;
    aiStore.chatError = 'Rate limit exceeded';

    const regenSpy = vi.spyOn(aiStore, 'regenerateLastChatMessage').mockResolvedValue();

    const wrapper = mount(AiChatDrawer, {
      global: {
        mocks: {
          t: (k: string) => k,
        },
      },
    });

    await flushPromises();

    const errorBanner = wrapper.find('[data-testid="ai-chat-error-banner"]');
    expect(errorBanner.exists()).toBe(true);
    expect(errorBanner.text()).toContain('Rate limit exceeded');

    const regenBtn = errorBanner.find('button');
    await regenBtn.trigger('click');

    expect(regenSpy).toHaveBeenCalledTimes(1);
  });
});
