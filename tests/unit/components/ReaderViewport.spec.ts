import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ReaderViewport from '../../../components/reader/ReaderViewport.vue';
import { useReaderStore } from '../../../stores/readerStore';

describe('ReaderViewport Component', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should render container with deterministic data-testid attribute', () => {
    const wrapper = mount(ReaderViewport);
    const viewport = wrapper.find('[data-testid="reader-viewport"]');
    expect(viewport.exists()).toBe(true);
  });

  it('should accurately expose data-rendering attribute based on reader state', async () => {
    const wrapper = mount(ReaderViewport);
    const readerStore = useReaderStore();

    expect(wrapper.attributes('data-rendering')).toBe('false');

    readerStore.setRendering(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.attributes('data-rendering')).toBe('true');

    readerStore.setRendering(false);
    await wrapper.vm.$nextTick();
    expect(wrapper.attributes('data-rendering')).toBe('false');
  });

  it('should apply color styles based on the selected reading theme', async () => {
    const wrapper = mount(ReaderViewport);
    const readerStore = useReaderStore();

    readerStore.setTheme('night');
    await wrapper.vm.$nextTick();

    const element = wrapper.element as HTMLElement;
    expect(['#18181b', 'rgb(24, 24, 27)']).toContain(element.style.backgroundColor);

    readerStore.setTheme('oled');
    await wrapper.vm.$nextTick();
    expect(['#000000', 'rgb(0, 0, 0)']).toContain(element.style.backgroundColor);
  });
});
