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

  it('should perform pure GPU CSS transform scaling without triggering engine re-renders on pinch zoom', async () => {
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

    // Advance debounce timer -> pure GPU CSS transform remains applied; engine re-render is not triggered
    await vi.advanceTimersByTimeAsync(300);
    await wrapper.vm.$nextTick();

    expect(onZoomRender).not.toHaveBeenCalled();
    expect(targetEl.style.transform).toContain('scale(4)');
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

    // Zoom again and verify automatic reset when changing pages in paginated mode
    readerStore.setPaginationMode('paginated');
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

  it('should keep the CSS zoom applied for engines that cannot re-render at a new scale (EPUB/FB2)', async () => {
    const wrapper = mount(ReaderViewport);
    const viewportEl = wrapper.find('[data-testid="reader-viewport"]').element as HTMLElement;
    const targetEl = wrapper.find('[data-testid="reader-gesture-target"]').element as HTMLElement;

    vi.spyOn(viewportEl, 'getBoundingClientRect').mockReturnValue({
      width: 400, height: 800, left: 0, top: 0, right: 400, bottom: 800, x: 0, y: 0,
      toJSON: () => ({}),
    });

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
    await vi.advanceTimersByTimeAsync(300);
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as unknown as { scale: number }).scale).toBe(2);
    expect(targetEl.style.transform).toContain('scale(2)');
  });

  it('should zoom on double-tap forwarded from an iframe touch source', async () => {
    const wrapper = mount(ReaderViewport);
    const viewportEl = wrapper.find('[data-testid="reader-viewport"]').element as HTMLElement;
    const targetEl = wrapper.find('[data-testid="reader-gesture-target"]').element as HTMLElement;
    const vm = wrapper.vm as unknown as { scale: number };

    vi.spyOn(viewportEl, 'getBoundingClientRect').mockReturnValue({
      width: 400, height: 800, left: 0, top: 0, right: 400, bottom: 800, x: 0, y: 0,
      toJSON: () => ({}),
    });

    const engineContainer = wrapper.find('[data-testid="reader-engine-container"]').element as HTMLElement;
    const frame = document.createElement('iframe');
    engineContainer.appendChild(frame);
    const frameDoc = document.implementation.createHTMLDocument('chapter');
    const bind = (engineContainer as unknown as {
      __readerBindTouchSource: (d: Document, f: HTMLElement) => () => void;
    }).__readerBindTouchSource;
    bind(frameDoc, frame);

    const tap = (): void => {
      frameDoc.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 100, clientY: 200 }]));
      frameDoc.dispatchEvent(
        createTouchEvent('touchend', [], [{ clientX: 100, clientY: 200 }]),
      );
    };
    tap();
    await vi.advanceTimersByTimeAsync(100);
    tap();

    expect(vm.scale).toBe(2.5);
  });

  it('should keep layout dimensions of zoomSizer, gestureTarget, and containerRef locked to 100% during zoom', async () => {
    const wrapper = mount(ReaderViewport);
    const viewportEl = wrapper.find('[data-testid="reader-viewport"]').element as HTMLElement;
    const scrollContainer = wrapper.find('[data-testid="zoom-scroll-container"]');
    const zoomSizer = wrapper.find('[data-testid="zoom-sizer"]');
    const gestureTarget = wrapper.find('[data-testid="reader-gesture-target"]');
    const engineContainer = wrapper.find('[data-testid="reader-engine-container"]');

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

    // Before zoom (scale = 1.0)
    expect((zoomSizer.element as HTMLElement).style.width).toBe('100%');
    expect((zoomSizer.element as HTMLElement).style.height).toBe('100%');
    expect(scrollContainer.classes()).toContain('overflow-hidden');
    expect(scrollContainer.classes()).not.toContain('overflow-auto');

    // Pinch to 2.5x
    viewportEl.dispatchEvent(
      createTouchEvent('touchstart', [
        { clientX: 200, clientY: 350 },
        { clientX: 200, clientY: 450 },
      ]),
    );
    viewportEl.dispatchEvent(
      createTouchEvent('touchmove', [
        { clientX: 200, clientY: 275 },
        { clientX: 200, clientY: 525 },
      ]),
    );
    viewportEl.dispatchEvent(createTouchEvent('touchend', []));
    await wrapper.vm.$nextTick();

    const vm = wrapper.vm as unknown as { scale: number };
    expect(vm.scale).toBe(2.5);

    // Layout box dimensions must remain locked to 100%
    expect((zoomSizer.element as HTMLElement).style.width).toBe('100%');
    expect((zoomSizer.element as HTMLElement).style.height).toBe('100%');
    expect(scrollContainer.classes()).toContain('overflow-hidden');
    expect(scrollContainer.classes()).not.toContain('overflow-auto');

    // transformOrigin must remain 'center center'
    expect((gestureTarget.element as HTMLElement).style.transformOrigin).toBe('center center');

    // Engine container must remain attached and sized to full
    expect(engineContainer.classes()).toContain('w-full');
    expect(engineContainer.classes()).toContain('h-full');
  });

  it('should maintain inner scroll position during zoom gestures without jumping', async () => {
    const wrapper = mount(ReaderViewport);
    const viewportEl = wrapper.find('[data-testid="reader-viewport"]').element as HTMLElement;
    const engineContainer = wrapper.find('[data-testid="reader-engine-container"]').element as HTMLElement;

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

    // Create an inner scroll container simulating PDF scroll mode
    const innerScrollEl = document.createElement('div');
    innerScrollEl.style.overflowY = 'auto';
    innerScrollEl.style.height = '100%';
    innerScrollEl.scrollTop = 420;
    engineContainer.appendChild(innerScrollEl);

    // Verify initial scrollTop
    expect(innerScrollEl.scrollTop).toBe(420);

    // Double-tap zoom into (200, 300)
    viewportEl.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 200, clientY: 300 }]));
    viewportEl.dispatchEvent(
      createTouchEvent('touchend', [], [{ clientX: 200, clientY: 300 }]),
    );
    await vi.advanceTimersByTimeAsync(100);
    viewportEl.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 200, clientY: 300 }]));
    viewportEl.dispatchEvent(
      createTouchEvent('touchend', [], [{ clientX: 200, clientY: 300 }]),
    );

    const vm = wrapper.vm as unknown as { scale: number };
    expect(vm.scale).toBe(2.5);

    // Inner scroll position must not have been reset or altered by layout reflow
    expect(innerScrollEl.scrollTop).toBe(420);
  });

  it('should preserve zoom level when locator or currentPage changes in scroll mode', async () => {
    const wrapper = mount(ReaderViewport);
    const readerStore = useReaderStore();
    const viewportEl = wrapper.find('[data-testid="reader-viewport"]').element as HTMLElement;

    readerStore.setPaginationMode('scroll');

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

    // Double-tap zoom to 2.5x
    viewportEl.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 200, clientY: 400 }]));
    viewportEl.dispatchEvent(
      createTouchEvent('touchend', [], [{ clientX: 200, clientY: 400 }]),
    );
    await vi.advanceTimersByTimeAsync(100);
    viewportEl.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 200, clientY: 400 }]));
    viewportEl.dispatchEvent(
      createTouchEvent('touchend', [], [{ clientX: 200, clientY: 400 }]),
    );

    const vm = wrapper.vm as unknown as { scale: number };
    expect(vm.scale).toBe(2.5);

    // Scroll updates location & page
    readerStore.updateLocation({ locator: 'loc-42', currentPage: 5, progressPercentage: 45 });
    await wrapper.vm.$nextTick();

    // Zoom must stay active in scroll mode
    expect(vm.scale).toBe(2.5);

    // Switching book id resets zoom
    readerStore.currentBook = {
      id: 'diff-book',
      title: 'Different',
      author: 'Author',
      format: 'pdf',
      fileSize: 100,
      addedAt: 0,
      lastReadAt: 0,
      currentPage: 1,
      totalPages: 1,
      progressPercentage: 0,
    };
    await wrapper.vm.$nextTick();
    expect(vm.scale).toBe(1);
  });

  it('should forward vertical pan overflow to the inner scroll container when zoomed in', async () => {
    const wrapper = mount(ReaderViewport);
    const viewportEl = wrapper.find('[data-testid="reader-viewport"]').element as HTMLElement;
    const engineContainer = wrapper.find('[data-testid="reader-engine-container"]').element as HTMLElement;

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

    // Create a mock scroll container inside engine container
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'pdf-scroll-container';
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 800, writable: true });
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 2400, writable: true });
    scrollContainer.scrollTop = 100;
    engineContainer.appendChild(scrollContainer);

    // Pinch to 2.0x (maxOffsetY = (800 * 2 - 800) / 2 = 400)
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

    const vm = wrapper.vm as unknown as { scale: number; translateY: number };
    expect(vm.scale).toBe(2.0);

    // Single-finger drag upward by 500px:
    // translateY moves from 0 to -400 (reaches boundary).
    // Remaining 100px overflows into scroll container: scrollTop += 100 / 2.0 = 50.
    viewportEl.dispatchEvent(createTouchEvent('touchstart', [{ clientX: 200, clientY: 400 }]));
    viewportEl.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 200, clientY: -100 }]));

    expect(vm.translateY).toBe(-400);
    expect(scrollContainer.scrollTop).toBe(150);

    // Drag another 80px upward: translateY stays -400, scrollTop += 80 / 2 = 40.
    viewportEl.dispatchEvent(createTouchEvent('touchmove', [{ clientX: 200, clientY: -180 }]));
    expect(vm.translateY).toBe(-400);
    expect(scrollContainer.scrollTop).toBe(190);
  });
});
