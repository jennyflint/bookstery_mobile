import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ReaderProgressBar from '~/components/reader/ReaderProgressBar.vue';
import { useReaderStore } from '~/stores/readerStore';
import { mockHaptics } from '../../mocks/capacitor-plugins';

function createPointerEvent(
  type: string,
  clientX: number,
  pointerId: number = 1,
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as unknown as PointerEvent;
  Object.defineProperty(event, 'clientX', { value: clientX, writable: false });
  Object.defineProperty(event, 'pointerId', { value: pointerId, writable: false });
  return event;
}

function createTouchEvent(
  type: string,
  clientX: number,
): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as unknown as TouchEvent;
  const touch = { clientX } as Touch;
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' || type === 'touchcancel' ? [] : [touch],
    writable: false,
  });
  return event;
}

describe('ReaderProgressBar Component', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    (window as unknown as { Capacitor: { Plugins: { Haptics: typeof mockHaptics } } }).Capacitor = {
      Plugins: {
        Haptics: mockHaptics,
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render expanded hit area with minimum touch height and touch-action: none', () => {
    const wrapper = mount(ReaderProgressBar, {
      props: {
        currentPage: 5,
        totalPages: 20,
      },
    });

    const scrubber = wrapper.find('[data-testid="reader-scrubber"]');
    expect(scrubber.exists()).toBe(true);
    expect(scrubber.attributes('role')).toBe('slider');
    expect(scrubber.attributes('aria-valuenow')).toBe('5');
    expect(scrubber.attributes('aria-valuemax')).toBe('20');

    const scrubberEl = scrubber.element as HTMLElement;
    expect(scrubberEl.style.touchAction).toBe('none');
    expect(scrubberEl.style.minHeight).toBe('40px');
  });

  it('should accurately calculate fill width and thumb position based on currentPage and totalPages', () => {
    const wrapper = mount(ReaderProgressBar, {
      props: {
        currentPage: 1,
        totalPages: 10,
      },
    });

    const fill = wrapper.find('[data-testid="scrubber-fill"]');
    const thumb = wrapper.find('[data-testid="scrubber-thumb"]');
    expect(fill.exists()).toBe(true);
    expect(thumb.exists()).toBe(true);

    // Page 1 of 10 -> ratio = (1 - 1) / (10 - 1) = 0%
    expect((fill.element as HTMLElement).style.width).toBe('0%');
    expect((thumb.element as HTMLElement).style.left).toBe('0%');
  });

  it('should calculate target page, update preview state and scale thumb during pointer drag', async () => {
    const wrapper = mount(ReaderProgressBar, {
      props: {
        currentPage: 2,
        totalPages: 10,
        chapterTitle: 'Chapter One: Introduction',
      },
    });

    const scrubber = wrapper.find('[data-testid="reader-scrubber"]');
    const track = wrapper.find('[data-testid="scrubber-track"]');
    const scrubberEl = scrubber.element as HTMLElement;
    const trackEl = track.element as HTMLElement;

    scrubberEl.setPointerCapture = vi.fn();
    scrubberEl.releasePointerCapture = vi.fn();

    vi.spyOn(trackEl, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 6,
      left: 10,
      top: 100,
      right: 210,
      bottom: 106,
      x: 10,
      y: 100,
      toJSON: () => ({}),
    });

    // Tooltip should not be visible before interaction
    expect(wrapper.find('[data-testid="scrubber-tooltip"]').exists()).toBe(false);

    // PointerDown at clientX = 110 (offset = 100px / 200px = 0.5 ratio -> page = Math.round(0.5 * 9) + 1 = 6)
    const downEvent = createPointerEvent('pointerdown', 110);
    const stopPropSpy = vi.spyOn(downEvent, 'stopPropagation');
    scrubberEl.dispatchEvent(downEvent);

    await wrapper.vm.$nextTick();

    expect(stopPropSpy).toHaveBeenCalled();
    expect(scrubberEl.setPointerCapture).toHaveBeenCalledWith(1);
    expect(wrapper.emitted('scrub-start')).toBeTruthy();
    expect(wrapper.emitted('scrub-start')?.[0]).toEqual([6]);

    // Tooltip should now be visible and display target page and chapter
    const tooltip = wrapper.find('[data-testid="scrubber-tooltip"]');
    expect(tooltip.exists()).toBe(true);
    expect(tooltip.text()).toContain('6');
    expect(tooltip.text()).toContain('10');
    expect(tooltip.text()).toContain('Chapter One: Introduction');

    // Thumb should be scaled up (active scale)
    const thumb = wrapper.find('[data-testid="scrubber-thumb"]');
    expect(thumb.classes()).toContain('scale-125');

    // During drag, no navigation should be committed yet
    expect(wrapper.emitted('navigate')).toBeFalsy();

    // Drag to clientX = 190 (offset = 180px / 200px = 0.9 ratio -> page = Math.round(0.9 * 9) + 1 = 9)
    await new Promise((r) => setTimeout(r, 50));
    const moveEvent = createPointerEvent('pointermove', 190);
    scrubberEl.dispatchEvent(moveEvent);

    await wrapper.vm.$nextTick();
    await new Promise((r) => setTimeout(r, 50));

    expect(wrapper.emitted('scrub-change')).toBeTruthy();
    expect(tooltip.text()).toContain('9');
    expect(mockHaptics.selectionChanged).toHaveBeenCalled();

    // Commit navigation on pointerup
    const upEvent = createPointerEvent('pointerup', 190);
    scrubberEl.dispatchEvent(upEvent);

    await wrapper.vm.$nextTick();

    expect(scrubberEl.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(wrapper.emitted('scrub-end')).toBeTruthy();
    expect(wrapper.emitted('navigate')).toBeTruthy();
    expect(wrapper.emitted('navigate')?.[0]).toEqual([9]);
    expect(thumb.classes()).toContain('scale-100');
  });

  it('should horizontally clamp floating tooltip so it never overflows track boundaries', async () => {
    const wrapper = mount(ReaderProgressBar, {
      props: {
        currentPage: 1,
        totalPages: 20,
      },
    });

    const scrubberEl = wrapper.find('[data-testid="reader-scrubber"]').element as HTMLElement;
    const trackEl = wrapper.find('[data-testid="scrubber-track"]').element as HTMLElement;

    vi.spyOn(trackEl, 'getBoundingClientRect').mockReturnValue({
      width: 300,
      height: 6,
      left: 0,
      top: 50,
      right: 300,
      bottom: 56,
      x: 0,
      y: 50,
      toJSON: () => ({}),
    });

    // PointerDown at far left: clientX = 0 (offset = 0px -> clamped to min 56px)
    scrubberEl.dispatchEvent(createPointerEvent('pointerdown', 0));
    await wrapper.vm.$nextTick();

    let tooltip = wrapper.find('[data-testid="scrubber-tooltip"]');
    expect((tooltip.element as HTMLElement).style.left).toBe('56px');

    // PointerMove to far right: clientX = 300 (offset = 300px -> clamped to max 300 - 56 = 244px)
    scrubberEl.dispatchEvent(createPointerEvent('pointermove', 300));
    await wrapper.vm.$nextTick();

    tooltip = wrapper.find('[data-testid="scrubber-tooltip"]');
    expect((tooltip.element as HTMLElement).style.left).toBe('244px');
  });

  it('should support touch gestures and smoothly revert on cancellation without navigating', async () => {
    const wrapper = mount(ReaderProgressBar, {
      props: {
        currentPage: 4,
        totalPages: 10,
      },
    });

    const scrubberEl = wrapper.find('[data-testid="reader-scrubber"]').element as HTMLElement;
    const trackEl = wrapper.find('[data-testid="scrubber-track"]').element as HTMLElement;

    vi.spyOn(trackEl, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 6,
      left: 0,
      top: 50,
      right: 200,
      bottom: 56,
      x: 0,
      y: 50,
      toJSON: () => ({}),
    });

    // TouchStart at clientX = 160 (ratio = 0.8 -> page 8)
    scrubberEl.dispatchEvent(createTouchEvent('touchstart', 160));
    await wrapper.vm.$nextTick();

    const vm = wrapper.vm as unknown as { isDragging: boolean; previewPage: number; displayPage: number };
    expect(vm.isDragging).toBe(true);
    expect(vm.previewPage).toBe(8);

    // Cancel touch interaction
    scrubberEl.dispatchEvent(createTouchEvent('touchcancel', 160));
    await wrapper.vm.$nextTick();

    expect(vm.isDragging).toBe(false);
    expect(vm.displayPage).toBe(4);
    expect(wrapper.emitted('navigate')).toBeFalsy();
  });

  it('should commit navigation directly to readerStore if registered', async () => {
    const readerStore = useReaderStore();
    const goToPageSpy = vi.spyOn(readerStore, 'goToPage');

    const wrapper = mount(ReaderProgressBar, {
      props: {
        currentPage: 2,
        totalPages: 8,
      },
    });

    const scrubberEl = wrapper.find('[data-testid="reader-scrubber"]').element as HTMLElement;
    const trackEl = wrapper.find('[data-testid="scrubber-track"]').element as HTMLElement;

    vi.spyOn(trackEl, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 6,
      left: 0,
      top: 50,
      right: 100,
      bottom: 56,
      x: 0,
      y: 50,
      toJSON: () => ({}),
    });

    // Drag to 100% (page 8)
    scrubberEl.dispatchEvent(createPointerEvent('pointerdown', 100));
    await wrapper.vm.$nextTick();

    scrubberEl.dispatchEvent(createPointerEvent('pointerup', 100));
    await wrapper.vm.$nextTick();

    expect(goToPageSpy).toHaveBeenCalledWith(8);
  });
});
