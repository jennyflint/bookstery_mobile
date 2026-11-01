import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import BookCard from '../../../app/components/library/BookCard.vue';
import type { BookRecord } from '../../../app/types';

describe('BookCard Component', () => {
  const baseBook: BookRecord = {
    id: 'book-test-1',
    title: 'Test Book Title',
    author: 'Test Author',
    format: 'pdf',
    file_path: 'books/test.pdf',
    cover_path: 'tests/fixtures/covers/book-test-1.webp',
    locator: '1',
    progress_percentage: 45,
    total_items: 100,
    last_read_at: Date.now(),
    updated_at: Date.now(),
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('should render cover image with custom cover_path when available and not cached', () => {
    const wrapper = mount(BookCard, {
      props: {
        book: baseBook,
      },
    });

    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('tests/fixtures/covers/book-test-1.webp');
  });

  it('should render cached base64 cover from localStorage when available', () => {
    localStorage.setItem('bookstery_cover_book-test-1', 'data:image/webp;base64,firstpagecontent');

    const wrapper = mount(BookCard, {
      props: {
        book: baseBook,
      },
    });

    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('data:image/webp;base64,firstpagecontent');
  });

  it('should render default fallback cover when cover_path is null and no cache exists', () => {
    const bookWithoutCover: BookRecord = {
      ...baseBook,
      id: 'book-no-cover',
      cover_path: null,
    };

    const wrapper = mount(BookCard, {
      props: {
        book: bookWithoutCover,
      },
    });

    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('/img/covers/default.webp');
  });

  it('should switch to default fallback cover when image error event fires and no cache exists', async () => {
    const wrapper = mount(BookCard, {
      props: {
        book: baseBook,
      },
    });

    const img = wrapper.find('img');
    expect(img.attributes('src')).toBe('tests/fixtures/covers/book-test-1.webp');

    await img.trigger('error');

    expect(img.attributes('src')).toBe('/img/covers/default.webp');
  });

  it('should not render pinned badge when is_pinned is 0 or undefined', () => {
    const wrapper = mount(BookCard, {
      props: {
        book: {
          ...baseBook,
          is_pinned: 0,
        },
      },
    });

    const badge = wrapper.find('[data-testid="pinned-badge"]');
    expect(badge.exists()).toBe(false);
  });

  it('should render pinned badge when is_pinned is 1', () => {
    const wrapper = mount(BookCard, {
      props: {
        book: {
          ...baseBook,
          is_pinned: 1,
        },
      },
    });

    const badge = wrapper.find('[data-testid="pinned-badge"]');
    expect(badge.exists()).toBe(true);
  });

  it('should render visible delete button and emit delete with book id when clicked', async () => {
    const wrapper = mount(BookCard, {
      props: {
        book: baseBook,
      },
    });

    const deleteBtn = wrapper.find('[data-testid="delete-book-btn"]');
    expect(deleteBtn.exists()).toBe(true);
    expect(deleteBtn.classes()).not.toContain('opacity-0');

    await deleteBtn.trigger('click');

    expect(wrapper.emitted('delete')).toBeTruthy();
    expect(wrapper.emitted('delete')?.[0]).toEqual([baseBook.id]);
  });

  it('should render menu button and emit open-menu with book when clicked', async () => {
    const wrapper = mount(BookCard, {
      props: {
        book: baseBook,
      },
    });

    const menuBtn = wrapper.find('[data-testid="book-menu-btn"]');
    expect(menuBtn.exists()).toBe(true);

    await menuBtn.trigger('click');

    expect(wrapper.emitted('open-menu')).toBeTruthy();
    expect(wrapper.emitted('open-menu')?.[0]).toEqual([baseBook]);
  });
});
