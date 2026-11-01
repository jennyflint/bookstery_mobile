import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BookSortControl from '../../../app/components/library/BookSortControl.vue';

describe('BookSortControl Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders trigger button and direction button with default values', () => {
    const wrapper = mount(BookSortControl, {
      props: {
        storageKey: 'test_component_sort',
      },
    });

    const triggerBtn = wrapper.find('[data-testid="sort-trigger-btn"]');
    const directionBtn = wrapper.find('[data-testid="sort-direction-btn"]');

    expect(triggerBtn.exists()).toBe(true);
    expect(directionBtn.exists()).toBe(true);
    expect(directionBtn.text()).toBe('↓'); // default is desc
  });

  it('toggles direction when quick direction button is clicked', async () => {
    const wrapper = mount(BookSortControl, {
      props: {
        storageKey: 'test_component_sort',
      },
    });

    const directionBtn = wrapper.find('[data-testid="sort-direction-btn"]');
    expect(directionBtn.text()).toBe('↓');

    await directionBtn.trigger('click');
    expect(wrapper.find('[data-testid="sort-direction-btn"]').text()).toBe('↑');

    await directionBtn.trigger('click');
    expect(wrapper.find('[data-testid="sort-direction-btn"]').text()).toBe('↓');
  });

  it('opens dropdown menu with white background and list of options when trigger is clicked', async () => {
    const wrapper = mount(BookSortControl, {
      props: {
        storageKey: 'test_component_sort',
      },
    });

    expect(wrapper.find('[data-testid="sort-dropdown-menu"]').exists()).toBe(false);

    await wrapper.find('[data-testid="sort-trigger-btn"]').trigger('click');

    const menu = wrapper.find('[data-testid="sort-dropdown-menu"]');
    expect(menu.exists()).toBe(true);
    expect(menu.classes()).toContain('bg-white');
    expect(menu.classes()).toContain('shadow-xl');

    // All options exist
    expect(wrapper.find('[data-testid="sort-option-lastReadAt"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sort-option-title"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sort-option-author"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sort-option-format"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sort-option-progress"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sort-option-fileSize"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sort-option-createdAt"]').exists()).toBe(true);
  });

  it('selects new sort option and closes menu', async () => {
    const wrapper = mount(BookSortControl, {
      props: {
        storageKey: 'test_component_sort',
      },
    });

    await wrapper.find('[data-testid="sort-trigger-btn"]').trigger('click');
    await wrapper.find('[data-testid="sort-option-title"]').trigger('click');

    expect(wrapper.find('[data-testid="sort-dropdown-menu"]').exists()).toBe(false);
    expect(wrapper.emitted('change')).toBeTruthy();
    expect(wrapper.emitted('change')?.[0]).toEqual([{ field: 'title', order: 'asc' }]);
  });

  it('toggles direction when active option is clicked in menu', async () => {
    const wrapper = mount(BookSortControl, {
      props: {
        storageKey: 'test_component_sort',
      },
    });

    await wrapper.find('[data-testid="sort-trigger-btn"]').trigger('click');
    // lastReadAt is currently active with desc order
    await wrapper.find('[data-testid="sort-option-lastReadAt"]').trigger('click');

    expect(wrapper.emitted('change')?.[0]).toEqual([{ field: 'lastReadAt', order: 'asc' }]);
  });

  it('closes menu when mobile backdrop is clicked', async () => {
    const wrapper = mount(BookSortControl, {
      props: {
        storageKey: 'test_component_sort',
      },
    });

    await wrapper.find('[data-testid="sort-trigger-btn"]').trigger('click');
    const backdrop = wrapper.find('[data-testid="sort-mobile-backdrop"]');
    expect(backdrop.exists()).toBe(true);

    await backdrop.trigger('click');
    expect(wrapper.find('[data-testid="sort-dropdown-menu"]').exists()).toBe(false);
  });

  it('aligns menu to left when placed near the left edge of mobile viewport to prevent overflow', async () => {
    const wrapper = mount(BookSortControl, {
      props: {
        storageKey: 'test_component_sort',
      },
    });

    // Mock getBoundingClientRect near left edge of mobile screen (360px wide)
    const el = wrapper.find('[data-testid="book-sort-control"]').element as HTMLElement;
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 16,
      right: 140,
      top: 100,
      bottom: 140,
      width: 124,
      height: 40,
      x: 16,
      y: 100,
      toJSON: () => {},
    });

    await wrapper.find('[data-testid="sort-trigger-btn"]').trigger('click');
    const menu = wrapper.find('[data-testid="sort-dropdown-menu"]');
    expect(menu.exists()).toBe(true);
    expect(menu.classes()).toContain('left-0');
  });
});
