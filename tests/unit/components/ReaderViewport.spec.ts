import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ReaderViewport from '~/components/reader/ReaderViewport.vue';
import { useReaderStore } from '~/stores/readerStore';

function createTouchEvent(
  type: string,
  touches: Array<{ clientX: number; clientY: number }>,
  changedTouches: Array<{ clientX: number; clientY: number }> = touches,
): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as unknown as TouchEvent;
  Object.defineProperty(event, 'touches', {
    value: touches,
    writable: false,
  });
  Object.defineProperty(event, 'changedTouches', {
    value: changedTouches,
    writable: false,
  });
  return event;
}

describe('ReaderViewport Component', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render container with deterministic data-testid attribute and touch-action: none', () => {
    const wrapper = mount(ReaderViewport);
    const viewport = wrapper.find('[data-testid="reader-viewport"]');
    expect(viewport.exists()).toBe(true);
    expect((viewport.element as HTMLElement).style.touchAction).toBe('none');
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

  it('should perform two-phase pinch scaling (real-time CSS transform during touchmove, debounced re-render and CSS scale reset on touchend)', async () => {
    const onZoomRender = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(ReaderViewport, {
      props: { onZoomRender },
    });

    const viewportEl = wrapper.find('[data-testid="reader-viewport"]').element as HTMLElement;
    const targetEl = wrapper.find('[data-testid="reader-gesture-target"]').element as HTMLElement;

    vi.spyOn(viewportEl, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 800,
      left: 0,
      top: 0,
      right: 400,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // Initial pinch distance = 100px (from y=350 to y=450 at x=200)
    viewportEl.dispatchEvent(
      createTouchEvent('touchstart', [
        { clientX: 200, clientY: 350 },
        { clientX: 200, clientY: 450 },
      ]),
    );

    // Move fingers to 250px apart -> 2.5x scale
    viewportEl.dispatchEvent(
      createTouchEvent('touchmove', [
        { clientX: 200, clientY: 275 },
        { clientX: 200, clientY: 525 },
      ]),
    );

    await wrapper.vm.$nextTick();
    expect(onZoomRender).not.toHaveBeenCalled();
    expect(targetEl.style.transform).toContain('scale(2.5)');

    // Move fingers to 600px apart -> 6.0x (will be clamped to 4.0x on touchend)
    viewportEl.dispatchEvent(
      createTouchEvent('touchmove', [
        { clientX: 200, clientY: 100 },
        { clientX: 200, clientY: 700 },
      ]),
    );

    viewportEl.dispatchEvent(createTouchEvent('touchend', []));
    await wrapper.vm.$nextTick();

    // Clamped to maxScale = 4.0 immediately on touchend
    expect((wrapper.vm as unknown as { scale: number }).scale).toBe(4);
    expect(targetEl.style.transform).toContain('scale(4)');
    expect(onZoomRender).not.toHaveBeenCalled();

    // Advance 200ms debounce timer -> triggers high-res render and resets CSS scale to 1
    await vi.advanceTimersByTimeAsync(200);
    await wrapper.vm.$nextTick();

    expect(onZoomRender).toHaveBeenCalledWith(4);
    expect(targetEl.style.transform).toContain('scale(1)');
  });

  it('should pan with boundary constraints when zoomed in and swipe to turn pages at scale 1.0', async () => {
    const wrapper = mount(ReaderViewport);
    const viewportEl = wrapper.find('[data-testid="reader-viewport"]').element as HTMLElement;
    const targetEl = wrapper.find('[data-testid="reader-gesture-target"]').element as HTMLElement;

    vi.spyOn(viewportEl, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 800,
      left: 0,
      top: 0,
      right: 400,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // At scale === 1.0, horizontal swipe left triggers 'next'
    viewportEl.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 300, clientY: 400 }]));
    viewportEl.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 180, clientY: 405 }]));
    viewportEl.dispatchEvent(
      createTouchEvent('touchend', [], [{ clientX: 180, clientY: 405 }]),
    );

    expect(wrapper.emitted('next')).toBeTruthy();

    // Pinch to 2.0x (maxOffsetX = 400 * (2 - 1) / 2 = 200, maxOffsetY = 800 * (2 - 1) / 2 = 400)
    viewportEl.dispatchEvent(
      createTouchEvent('touchstart', [
        { clientX: 200, clientY: 350 },
        { clientX: 200, clientY: 450 },
      ]),
    );
    viewportEl.dispatchEvent(
      createTouchEvent('touchmove', [
        { clientX: 200, clientY: 300 },
        { clientX: 200, clientY: 500 },
      ]),
    );
    viewportEl.dispatchEvent(createTouchEvent('touchend', []));
    await vi.advanceTimersByTimeAsync(200);

    // Single-finger drag way past boundary (+500px X, -600px Y) -> clamped to (200, -400)
    viewportEl.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 200, clientY: 400 }]));
    viewportEl.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 700, clientY: -200 }]));
    viewportEl.dispatchEvent(
      createTouchEvent('touchend', [], [{ clientX: 700, clientY: -200 }]),
    );

    await wrapper.vm.$nextTick();
    expect(targetEl.style.transform).toContain('translate3d(200px, -400px, 0)');
  });

  it('should toggle 2.5x zoom on double-tap within 300ms and reset on second double-tap or page change', async () => {
    const wrapper = mount(ReaderViewport);
    const readerStore = useReaderStore();
    const viewportEl = wrapper.find('[data-testid="reader-viewport"]').element as HTMLElement;

    vi.spyOn(viewportEl, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 800,
      left: 0,
      top: 0,
      right: 400,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // First tap at (100, 300)
    viewportEl.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 300 }]));
    viewportEl.dispatchEvent(
      createTouchEvent('touchend', [], [{ clientX: 100, clientY: 300 }]),
    );

    await vi.advanceTimersByTimeAsync(150);

    // Second tap within 300ms at (100, 300) -> zooms to 2.5x focused at tap point
    viewportEl.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 300 }]));
    viewportEl.dispatchEvent(
      createTouchEvent('touchend', [], [{ clientX: 100, clientY: 300 }]),
    );

    const vm = wrapper.vm as unknown as {
      scale: number;
      translateX: number;
      translateY: number;
      resetZoom: () => void;
    };

    expect(vm.scale).toBe(2.5);
    expect(vm.translateX).toBe(150);
    expect(vm.translateY).toBe(150);

    await vi.advanceTimersByTimeAsync(400);

    // Double-tap again while zoomed -> resets back to 1.0 and centers (0, 0)
    viewportEl.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 200, clientY: 400 }]));
    viewportEl.dispatchEvent(
      createTouchEvent('touchend', [], [{ clientX: 200, clientY: 400 }]),
    );
    await vi.advanceTimersByTimeAsync(100);
    viewportEl.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 200, clientY: 400 }]));
    viewportEl.dispatchEvent(
      createTouchEvent('touchend', [], [{ clientX: 200, clientY: 400 }]),
    );

    expect(vm.scale).toBe(1);
    expect(vm.translateX).toBe(0);
    expect(vm.translateY).toBe(0);

    // Zoom again and verify automatic reset when changing pages
    await vi.advanceTimersByTimeAsync(400);
    viewportEl.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 120, clientY: 250 }]));
    viewportEl.dispatchEvent(
      createTouchEvent('touchend', [], [{ clientX: 120, clientY: 250 }]),
    );
    await vi.advanceTimersByTimeAsync(100);
    viewportEl.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 120, clientY: 250 }]));
    viewportEl.dispatchEvent(
      createTouchEvent('touchend', [], [{ clientX: 120, clientY: 250 }]),
    );
    expect(vm.scale).toBe(2.5);

    readerStore.updateLocation({ locator: '2', progressPercentage: 20, currentPage: 2 });
    await wrapper.vm.$nextTick();

    expect(vm.scale).toBe(1);
    expect(vm.translateX).toBe(0);
    expect(vm.translateY).toBe(0);
  });
});

