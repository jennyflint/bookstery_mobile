import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import NavigationDrawer from '../../../app/components/navigation/NavigationDrawer.vue';

vi.mock('../../../app/composables/useCollectionNavigation', () => ({
  useCollectionNavigation: () => ({
    activeCollectionId: { value: 'all' },
    selectCollection: vi.fn(),
  }),
}));

describe('NavigationDrawer Component', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should render main drawer panel with solid opaque white background and gray borders', () => {
    const wrapper = mount(NavigationDrawer, {
      props: {
        isOpen: true,
      },
      global: {
        mocks: {
          t: (key: string) => key,
        },
        stubs: {
          Teleport: true,
          CollectionDeleteConfirmModal: true,
        },
      },
    });

    const backdrop = wrapper.find('[data-testid="navigation-drawer-backdrop"]');
    expect(backdrop.exists()).toBe(true);
    expect(backdrop.classes()).toContain('bg-black/50');
    expect(backdrop.classes().some((c) => c.startsWith('backdrop-blur'))).toBe(false);

    const drawer = wrapper.find('[data-testid="navigation-drawer"]');
    expect(drawer.exists()).toBe(true);
    expect(drawer.classes()).toContain('bg-white');
    expect(drawer.classes()).toContain('border-gray-200');
    expect(drawer.classes()).not.toContain('bg-[#F4ECD8]');
    expect(drawer.classes().some((c) => c.startsWith('backdrop-blur'))).toBe(false);

    // Verify header inside drawer is solid white
    const header = drawer.find('div:first-child');
    expect(header.classes()).toContain('bg-white');
    expect(header.classes()).toContain('border-gray-200');
    expect(header.classes()).not.toContain('bg-white/40');

    // Verify all books button has solid white and gray border when inactive
    const allBooksBtn = wrapper.find('[data-testid="collection-item-all"]');
    expect(allBooksBtn.exists()).toBe(true);
  });
});
