import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import BookGrid from './BookGrid.vue';
import { useLibraryStore } from '../../stores/libraryStore';
import { useCollectionStore } from '../../stores/collectionStore';
import { handleBackButtonPress } from '../../composables/useAndroidBackButton';
import type { BookRecord } from '../../types';

vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: {},
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe('BookGrid Component - Deletion Confirmation Flow', () => {
  const sampleBook1: BookRecord = {
    id: 'book-1',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    format: 'epub',
    file_path: 'books/gatsby.epub',
    cover_path: null,
    locator: '1',
    progress_percentage: 20,
    total_items: 100,
    last_read_at: 1000,
    updated_at: 1000,
    is_pinned: 0,
    pinned_at: null,
  };

  const sampleBook2: BookRecord = {
    id: 'book-2',
    title: '1984',
    author: 'George Orwell',
    format: 'pdf',
    file_path: 'books/1984.pdf',
    cover_path: null,
    locator: '1',
    progress_percentage: 50,
    total_items: 200,
    last_read_at: 2000,
    updated_at: 2000,
    is_pinned: 1,
    pinned_at: 2000,
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  const mountGrid = () => {
    return mount(BookGrid, {
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });
  };

  it('opens confirmation modal on BookCard delete click and does not delete immediately', async () => {
    const libraryStore = useLibraryStore();
    libraryStore.books = [sampleBook1];

    const removeBookSpy = vi.spyOn(libraryStore, 'removeBook').mockResolvedValue(undefined);
    const wrapper = mountGrid();
    await flushPromises();

    // Verify modal is not visible initially
    expect(wrapper.find('[data-testid="book-delete-confirm-modal"]').exists()).toBe(false);

    // Click delete button on BookCard
    const deleteBtn = wrapper.find('[data-testid="delete-book-btn"]');
    expect(deleteBtn.exists()).toBe(true);
    await deleteBtn.trigger('click');
    await flushPromises();

    // Verify confirmation modal opens with book details
    const modal = wrapper.find('[data-testid="book-delete-confirm-modal"]');
    expect(modal.exists()).toBe(true);
    expect(modal.text()).toContain('The Great Gatsby');
    expect(removeBookSpy).not.toHaveBeenCalled();

    // Cancel deletion
    const cancelBtn = wrapper.find('[data-testid="cancel-delete-book-btn"]');
    await cancelBtn.trigger('click');
    await flushPromises();

    // Modal closed and still no removeBook call
    expect(wrapper.find('[data-testid="book-delete-confirm-modal"]').exists()).toBe(false);
    expect(removeBookSpy).not.toHaveBeenCalled();
  });

  it('calls libraryStore.removeBook only after clicking confirm-delete-book-btn', async () => {
    const libraryStore = useLibraryStore();
    const collectionStore = useCollectionStore();
    libraryStore.books = [sampleBook1];

    const removeBookSpy = vi.spyOn(libraryStore, 'removeBook').mockResolvedValue(undefined);
    const fetchCollectionsSpy = vi.spyOn(collectionStore, 'fetchCollections').mockResolvedValue(undefined);

    const wrapper = mountGrid();
    await flushPromises();

    // Click delete on book card
    const deleteBtn = wrapper.find('[data-testid="delete-book-btn"]');
    await deleteBtn.trigger('click');
    await flushPromises();

    // Confirm deletion
    const confirmBtn = wrapper.find('[data-testid="confirm-delete-book-btn"]');
    expect(confirmBtn.exists()).toBe(true);
    await confirmBtn.trigger('click');
    await flushPromises();

    expect(removeBookSpy).toHaveBeenCalledTimes(1);
    expect(removeBookSpy).toHaveBeenCalledWith('book-1');
    expect(fetchCollectionsSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="book-delete-confirm-modal"]').exists()).toBe(false);
  });

  it('opens confirmation modal when triggered from BookActionMenu delete action', async () => {
    const libraryStore = useLibraryStore();
    libraryStore.books = [sampleBook1];

    const removeBookSpy = vi.spyOn(libraryStore, 'removeBook').mockResolvedValue(undefined);
    const wrapper = mountGrid();
    await flushPromises();

    // Open BookActionMenu
    const menuBtn = wrapper.find('[data-testid="book-menu-btn"]');
    await menuBtn.trigger('click');
    await flushPromises();

    const actionMenu = wrapper.find('[data-testid="book-action-menu"]');
    expect(actionMenu.exists()).toBe(true);

    // Trigger delete from menu
    const menuDeleteBtn = wrapper.find('[data-testid="action-delete-book"]');
    expect(menuDeleteBtn.exists()).toBe(true);
    await menuDeleteBtn.trigger('click');
    await flushPromises();

    // Action menu should close and delete confirm modal should be open
    expect(removeBookSpy).not.toHaveBeenCalled();
    const confirmModal = wrapper.find('[data-testid="book-delete-confirm-modal"]');
    expect(confirmModal.exists()).toBe(true);
    expect(confirmModal.text()).toContain('The Great Gatsby');

    // Confirm delete
    const confirmBtn = wrapper.find('[data-testid="confirm-delete-book-btn"]');
    await confirmBtn.trigger('click');
    await flushPromises();

    expect(removeBookSpy).toHaveBeenCalledWith('book-1');
  });

  it('closes delete confirm modal on Android back button press', async () => {
    const libraryStore = useLibraryStore();
    libraryStore.books = [sampleBook2];

    const removeBookSpy = vi.spyOn(libraryStore, 'removeBook').mockResolvedValue(undefined);
    const wrapper = mountGrid();
    await flushPromises();

    // Click delete
    const deleteBtn = wrapper.find('[data-testid="delete-book-btn"]');
    await deleteBtn.trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="book-delete-confirm-modal"]').exists()).toBe(true);

    // Simulate Android Back Button press
    await handleBackButtonPress();
    await flushPromises();

    expect(wrapper.find('[data-testid="book-delete-confirm-modal"]').exists()).toBe(false);
    expect(removeBookSpy).not.toHaveBeenCalled();
  });
});
