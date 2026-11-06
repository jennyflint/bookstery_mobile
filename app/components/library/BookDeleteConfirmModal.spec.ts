import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BookDeleteConfirmModal from './BookDeleteConfirmModal.vue';
import type { BookRecord } from '../../types';

describe('BookDeleteConfirmModal Component', () => {
  const sampleBook: BookRecord = {
    id: 'book-123',
    title: 'Kobzar',
    author: 'Taras Shevchenko',
    format: 'epub',
    file_path: '/books/kobzar.epub',
    cover_path: null,
    locator: 'epubcfi(/6/2)',
    progress_percentage: 42,
    total_items: 200,
    last_read_at: Date.now(),
    updated_at: Date.now(),
  };

  it('should not render anything when isOpen is false', () => {
    const wrapper = mount(BookDeleteConfirmModal, {
      props: {
        isOpen: false,
        book: sampleBook,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    expect(wrapper.find('[data-testid="book-delete-confirm-modal"]').exists()).toBe(false);
  });

  it('should render modal content correctly when isOpen is true', () => {
    const wrapper = mount(BookDeleteConfirmModal, {
      props: {
        isOpen: true,
        book: sampleBook,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const modal = wrapper.find('[data-testid="book-delete-confirm-modal"]');
    expect(modal.exists()).toBe(true);

    expect(wrapper.text()).toContain('library.deleteConfirmTitle');
    expect(wrapper.text()).toContain('Kobzar');
    expect(wrapper.text()).toContain('Taras Shevchenko');
    expect(wrapper.text()).toContain('library.deleteConfirmMessage');

    const cancelBtn = wrapper.find('[data-testid="cancel-delete-book-btn"]');
    const confirmBtn = wrapper.find('[data-testid="confirm-delete-book-btn"]');
    expect(cancelBtn.exists()).toBe(true);
    expect(confirmBtn.exists()).toBe(true);
    expect(cancelBtn.text()).toContain('library.deleteCancelBtn');
    expect(confirmBtn.text()).toContain('library.deleteConfirmBtn');
  });

  it('should emit close when clicking on overlay backdrop', async () => {
    const wrapper = mount(BookDeleteConfirmModal, {
      props: {
        isOpen: true,
        book: sampleBook,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const backdrop = wrapper.find('[data-testid="book-delete-confirm-modal"]');
    await backdrop.trigger('click');

    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('should emit close when clicking the cancel button', async () => {
    const wrapper = mount(BookDeleteConfirmModal, {
      props: {
        isOpen: true,
        book: sampleBook,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const cancelBtn = wrapper.find('[data-testid="cancel-delete-book-btn"]');
    await cancelBtn.trigger('click');

    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('should emit confirm with book id when clicking the confirm delete button', async () => {
    const wrapper = mount(BookDeleteConfirmModal, {
      props: {
        isOpen: true,
        book: sampleBook,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const confirmBtn = wrapper.find('[data-testid="confirm-delete-book-btn"]');
    await confirmBtn.trigger('click');

    expect(wrapper.emitted('confirm')).toBeTruthy();
    expect(wrapper.emitted('confirm')?.[0]).toEqual(['book-123']);
  });

  it('should render book title without author when author is missing', () => {
    const bookWithoutAuthor: BookRecord = {
      ...sampleBook,
      author: '',
    };

    const wrapper = mount(BookDeleteConfirmModal, {
      props: {
        isOpen: true,
        book: bookWithoutAuthor,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    expect(wrapper.find('[data-testid="book-delete-confirm-modal"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Kobzar');
  });
});
