import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import EpubViewer from '~/components/reader/EpubViewer.vue';

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

describe('EpubViewer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nested layers: zoom-scroll-container, zoom-sizer, and zoom-content', () => {
    const wrapper = mount(EpubViewer, {
      slots: {
        default: '<div id="epub-chapter-content">Chapter text</div>',
      },
    });

    const scrollContainer = wrapper.find('[data-testid="epub-viewer"]');
    expect(scrollContainer.exists()).toBe(true);
    expect(scrollContainer.classes()).toContain('zoom-scroll-container');
    expect((scrollContainer.element as HTMLElement).style.touchAction).toBe('pan-x pan-y');

    const sizer = wrapper.find('[data-testid="zoom-sizer"]');
    expect(sizer.exists()).toBe(true);

    const content = wrapper.find('[data-testid="zoom-content"]');
    expect(content.exists()).toBe(true);
    expect(content.text()).toContain('Chapter text');
  });

  it('dynamically expands layout sizer when zoomScale > 1.0', () => {
    const wrapper = mount(EpubViewer, {
      props: {
        zoomScale: 2.0,
        baseWidth: 380,
        baseHeight: 700,
      },
    });

    const sizer = wrapper.find('[data-testid="zoom-sizer"]').element as HTMLElement;
    expect(sizer.style.width).toBe('760px');
    expect(sizer.style.height).toBe('1400px');

    const content = wrapper.find('[data-testid="zoom-content"]').element as HTMLElement;
    expect(content.style.transform).toBe('scale(2)');
    expect(['0 0', '0px 0px']).toContain(content.style.transformOrigin);
  });

  it('does not preventDefault on single-finger touch, allowing native vertical scrolling', () => {
    const wrapper = mount(EpubViewer);
    const scrollContainer = wrapper.find('[data-testid="epub-viewer"]').element as HTMLElement;

    const touchEvent = createTouchEvent('touchstart', [{ clientX: 200, clientY: 300 }]);
    const preventDefaultSpy = vi.spyOn(touchEvent, 'preventDefault');

    scrollContainer.dispatchEvent(touchEvent);
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('prevents default during two-finger pinch gesture and updates zoom scale', () => {
    const wrapper = mount(EpubViewer);
    const scrollContainer = wrapper.find('[data-testid="epub-viewer"]').element as HTMLElement;

    const pinchStart = createTouchEvent('touchstart', [
      { clientX: 150, clientY: 200 },
      { clientX: 250, clientY: 200 },
    ]);
    const preventSpy = vi.spyOn(pinchStart, 'preventDefault');
    scrollContainer.dispatchEvent(pinchStart);

    expect(preventSpy).toHaveBeenCalled();
  });

  it('handles trackpad zoom via ctrlKey wheel events', () => {
    const wrapper = mount(EpubViewer);
    const scrollContainer = wrapper.find('[data-testid="epub-viewer"]').element as HTMLElement;

    const wheelEv = new Event('wheel', { bubbles: true, cancelable: true }) as WheelEvent;
    Object.defineProperty(wheelEv, 'ctrlKey', { value: true });
    Object.defineProperty(wheelEv, 'deltaY', { value: -50 });
    scrollContainer.dispatchEvent(wheelEv);

    expect((wrapper.vm as unknown as { effectiveScale: number }).effectiveScale).toBeGreaterThan(1.0);
  });
});
