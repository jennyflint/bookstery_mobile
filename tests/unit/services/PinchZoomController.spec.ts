import { describe, it, expect } from 'vitest';
import { PinchZoomController } from '~/services/engines/PinchZoomController';

function createWrapper(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ width: 400, height: 800, left: 0, top: 0, right: 400, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return el;
}

describe('PinchZoomController pan limits', () => {
  it('bounds panning to the viewport when the content size is unknown', () => {
    const controller = new PinchZoomController({ wrapper: createWrapper() });
    expect(controller.clampTranslation(999, 999, 2)).toEqual({ x: 200, y: 400 });
  });

  it('bounds panning to the content and keeps small content centered', () => {
    const controller = new PinchZoomController({
      wrapper: createWrapper(),
      getContentSize: () => ({ width: 300, height: 400 }),
    });
    // 300 * 2 = 600 wide (200px beyond the 400px viewport -> 100px each side); 400 * 2 = 800 tall fits exactly.
    expect(controller.clampTranslation(999, 999, 2)).toEqual({ x: 100, y: 0 });
    const negative = controller.clampTranslation(-999, -999, 2);
    expect(negative.x).toBe(-100);
    expect(Math.abs(negative.y)).toBe(0);
  });

  it('allows zoom out down to 0.5 and keeps centered translation at scale <= 1.0', () => {
    const wrapper = createWrapper();
    const controller = new PinchZoomController({
      wrapper,
      minScale: 0.5,
      maxScale: 4.0,
    });

    controller.setScale(0.5);
    expect(controller.getState().scale).toBe(0.5);
    expect(controller.getState().cssScale).toBe(0.5);
    expect(controller.getState().translateX).toBe(0);
    expect(controller.getState().translateY).toBe(0);

    // Below minScale clamps to 0.5
    controller.setScale(0.2);
    expect(controller.getState().scale).toBe(0.5);

    // resetZoom snaps cleanly back to 1.0
    controller.resetZoom();
    expect(controller.getState().scale).toBe(1.0);
    expect(controller.getState().translateX).toBe(0);
    expect(controller.getState().translateY).toBe(0);
  });

  it('accurately calculates vertical clamping bounds when scaled height exceeds viewport', () => {
    const controller = new PinchZoomController({
      wrapper: createWrapper(),
      getContentSize: () => ({ width: 400, height: 600 }),
    });
    // 600 * 2 = 1200 high, viewport is 800 -> maxPanY = (1200 - 800) / 2 = 200
    const clamped = controller.clampTranslation(0, 999, 2);
    expect(clamped.y).toBe(200);

    const clampedTop = controller.clampTranslation(0, -999, 2);
    expect(clampedTop.y).toBe(-200);
  });

  it('pans smoothly via desktop mouse wheel events when scale > 1.0', () => {
    const wrapper = createWrapper();
    const controller = new PinchZoomController({
      wrapper,
    });

    controller.setScale(2.0);
    expect(controller.getState().scale).toBe(2.0);

    // Wheel event with deltaY = 50 -> pans down
    wrapper.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: 50, cancelable: true }));
    expect(controller.getState().translateY).toBe(-50);

    // Wheel event with deltaX = 30 -> pans right
    wrapper.dispatchEvent(new WheelEvent('wheel', { deltaX: 30, deltaY: 0, cancelable: true }));
    expect(controller.getState().translateX).toBe(-30);
  });

  it('keeps focal point stationary on both X and Y axes during pinch-to-zoom without shifting upward', () => {
    const wrapper = createWrapper();
    const target = document.createElement('div');
    wrapper.appendChild(target);

    const controller = new PinchZoomController({
      wrapper,
      target,
      minScale: 0.5,
      maxScale: 4.0,
    });

    // Start pinch with midpoint at (200, 200) - top half of 400x800 viewport (center is 200, 400)
    wrapper.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [
          { clientX: 150, clientY: 200 } as Touch,
          { clientX: 250, clientY: 200 } as Touch,
        ],
        cancelable: true,
      }),
    );

    // Expand fingers to 2x distance while keeping midpoint stationary at (200, 200)
    wrapper.dispatchEvent(
      new TouchEvent('touchmove', {
        touches: [
          { clientX: 100, clientY: 200 } as Touch,
          { clientX: 300, clientY: 200 } as Touch,
        ],
        cancelable: true,
      }),
    );

    const state = controller.getState();
    expect(state.scale).toBe(2.0);
    expect(state.translateX).toBe(0);
    expect(state.translateY).toBe(200);

    // Verify focal point invariant:
    // Screen position = centerY + (tapY - centerY) * scale + translateY
    // = 400 + (200 - 400) * 2 + 200 = 400 - 400 + 200 = 200
    const screenY = 400 + (200 - 400) * state.scale + state.translateY;
    const screenX = 200 + (200 - 200) * state.scale + state.translateX;
    expect(screenX).toBe(200);
    expect(screenY).toBe(200);
  });

  it('clamps nextScale before computing scaleChange so translation does not drift past maxScale', () => {
    const wrapper = createWrapper();
    const target = document.createElement('div');
    wrapper.appendChild(target);

    const controller = new PinchZoomController({
      wrapper,
      target,
      minScale: 0.5,
      maxScale: 4.0,
    });

    // Initial pinch distance = 100px, midpoint = (200, 200)
    wrapper.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [
          { clientX: 150, clientY: 200 } as Touch,
          { clientX: 250, clientY: 200 } as Touch,
        ],
        cancelable: true,
      }),
    );

    // Move fingers to 600px distance -> ratio = 6.0, but maxScale is 4.0
    wrapper.dispatchEvent(
      new TouchEvent('touchmove', {
        touches: [
          { clientX: -100, clientY: 200 } as Touch,
          { clientX: 500, clientY: 200 } as Touch,
        ],
        cancelable: true,
      }),
    );

    const stateAtMax = controller.getState();
    expect(stateAtMax.scale).toBe(4.0);
    const translateYAtMax = stateAtMax.translateY;

    // Expand fingers further to 800px distance -> scale remains clamped at 4.0, translateY does not drift
    wrapper.dispatchEvent(
      new TouchEvent('touchmove', {
        touches: [
          { clientX: -200, clientY: 200 } as Touch,
          { clientX: 600, clientY: 200 } as Touch,
        ],
        cancelable: true,
      }),
    );

    const statePastMax = controller.getState();
    expect(statePastMax.scale).toBe(4.0);
    expect(statePastMax.translateY).toBe(translateYAtMax);
  });

  it('maintains focal point invariant during a second pinch while already zoomed', () => {
    const wrapper = createWrapper();
    const target = document.createElement('div');
    wrapper.appendChild(target);

    const controller = new PinchZoomController({
      wrapper,
      target,
      minScale: 0.5,
      maxScale: 5.0,
    });

    // First pinch to 2.0x focused at (200, 200)
    wrapper.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [
          { clientX: 150, clientY: 200 } as Touch,
          { clientX: 250, clientY: 200 } as Touch,
        ],
        cancelable: true,
      }),
    );
    wrapper.dispatchEvent(
      new TouchEvent('touchmove', {
        touches: [
          { clientX: 100, clientY: 200 } as Touch,
          { clientX: 300, clientY: 200 } as Touch,
        ],
        cancelable: true,
      }),
    );
    wrapper.dispatchEvent(new TouchEvent('touchend', { touches: [], cancelable: true }));

    const state1 = controller.getState();
    expect(state1.scale).toBe(2.0);
    expect(state1.translateY).toBe(200);

    // Second pinch starting while already zoomed: midpoint again at (200, 200), distance = 100
    wrapper.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [
          { clientX: 150, clientY: 200 } as Touch,
          { clientX: 250, clientY: 200 } as Touch,
        ],
        cancelable: true,
      }),
    );

    // Expand to 150px distance -> scaleChange = 1.5, scale = 2.0 * 1.5 = 3.0
    wrapper.dispatchEvent(
      new TouchEvent('touchmove', {
        touches: [
          { clientX: 125, clientY: 200 } as Touch,
          { clientX: 275, clientY: 200 } as Touch,
        ],
        cancelable: true,
      }),
    );

    const state2 = controller.getState();
    expect(state2.scale).toBe(3.0);
    // translateY = (-200) * (1 - 1.5) + 200 * 1.5 = 100 + 300 = 400
    expect(state2.translateY).toBe(400);

    // Initial content point that was at screen (200, 200):
    // elemY = (200 - 400 - 200) / 2 = -200
    // At scale 3.0: screenY = 400 + (-200) * 3 + 400 = 200
    const screenY = 400 + (-200) * state2.scale + state2.translateY;
    expect(screenY).toBe(200);
  });

  it('keeps tap coordinate stationary after double-tap zoom', () => {
    const wrapper = createWrapper();
    const target = document.createElement('div');
    wrapper.appendChild(target);

    const controller = new PinchZoomController({
      wrapper,
      target,
      doubleTapScale: 2.5,
    });

    // Double-tap at (100, 300) in 400x800 viewport (center is 200, 400)
    // rawX = -(100 - 200) * (2.5 - 1) = 150
    // rawY = -(300 - 400) * (2.5 - 1) = 150
    wrapper.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 300 } as Touch],
        cancelable: true,
      }),
    );
    wrapper.dispatchEvent(
      new TouchEvent('touchend', {
        touches: [],
        changedTouches: [{ clientX: 100, clientY: 300 } as Touch],
        cancelable: true,
      }),
    );
    wrapper.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 300 } as Touch],
        cancelable: true,
      }),
    );
    wrapper.dispatchEvent(
      new TouchEvent('touchend', {
        touches: [],
        changedTouches: [{ clientX: 100, clientY: 300 } as Touch],
        cancelable: true,
      }),
    );

    const state = controller.getState();
    expect(state.scale).toBe(2.5);
    expect(state.translateX).toBe(150);
    expect(state.translateY).toBe(150);

    // Verify tap point screen position after zoom:
    const screenX = 200 + (100 - 200) * state.scale + state.translateX;
    const screenY = 400 + (300 - 400) * state.scale + state.translateY;
    expect(screenX).toBe(100);
    expect(screenY).toBe(300);
  });

  it('forwards overflowing vertical pan deltas to the scroll container at 1:1 screen speed', () => {
    const wrapper = createWrapper();
    const target = document.createElement('div');
    wrapper.appendChild(target);

    const scrollEl = document.createElement('div');
    scrollEl.className = 'fb2-document-wrapper';
    Object.defineProperty(scrollEl, 'clientHeight', { value: 800, writable: true });
    Object.defineProperty(scrollEl, 'scrollHeight', { value: 3000, writable: true });
    scrollEl.scrollTop = 500;
    target.appendChild(scrollEl);

    const controller = new PinchZoomController({
      wrapper,
      target,
    });

    controller.setScale(2.0);
    // Viewport 400x800 at scale 2.0 -> maxOffsetY = (800 * 2 - 800) / 2 = 400

    // Touch start at (200, 400)
    wrapper.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [{ clientX: 200, clientY: 400 } as Touch],
        cancelable: true,
      }),
    );

    // Pan up by 500px:
    // translateY goes from 0 to -400 (boundary).
    // Remaining 100px overflows: scrollTop += 100 / 2.0 = 50 -> 550.
    wrapper.dispatchEvent(
      new TouchEvent('touchmove', {
        touches: [{ clientX: 200, clientY: -100 } as Touch],
        cancelable: true,
      }),
    );

    expect(controller.getState().translateY).toBe(-400);
    expect(scrollEl.scrollTop).toBe(550);

    // Pan up by another 60px:
    // translateY remains clamped at -400.
    // 60px overflows: scrollTop += 60 / 2.0 = 30 -> 580.
    wrapper.dispatchEvent(
      new TouchEvent('touchmove', {
        touches: [{ clientX: 200, clientY: -160 } as Touch],
        cancelable: true,
      }),
    );

    expect(controller.getState().translateY).toBe(-400);
    expect(scrollEl.scrollTop).toBe(580);
  });

  it('forwards overflowing wheel deltas to the scroll container at 1:1 screen speed', () => {
    const wrapper = createWrapper();
    const target = document.createElement('div');
    wrapper.appendChild(target);

    const scrollEl = document.createElement('div');
    scrollEl.className = 'epub-container';
    Object.defineProperty(scrollEl, 'clientHeight', { value: 800, writable: true });
    Object.defineProperty(scrollEl, 'scrollHeight', { value: 3000, writable: true });
    scrollEl.scrollTop = 200;
    target.appendChild(scrollEl);

    const controller = new PinchZoomController({
      wrapper,
      target,
    });

    controller.setScale(2.0);

    // Wheel down by 450px:
    // translateY goes from 0 to -400 (boundary).
    // Remaining 50px overflows: scrollTop += 50 / 2.0 = 25 -> 225.
    wrapper.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: 450, cancelable: true }));

    expect(controller.getState().translateY).toBe(-400);
    expect(scrollEl.scrollTop).toBe(225);

    // Wheel down by another 100px:
    // translateY stays -400.
    // 100px overflows: scrollTop += 100 / 2.0 = 50 -> 275.
    wrapper.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: 100, cancelable: true }));

    expect(controller.getState().translateY).toBe(-400);
    expect(scrollEl.scrollTop).toBe(275);
  });

  it('finds scrollable container across EPUB, PDF, FB2 and reflow elements', () => {
    const wrapper = createWrapper();
    const controller = new PinchZoomController({ wrapper });

    expect(controller.findScrollableContainer()).toBeNull();

    const epub = document.createElement('div');
    epub.className = 'epub-container';
    Object.defineProperty(epub, 'clientHeight', { value: 600, writable: true });
    Object.defineProperty(epub, 'scrollHeight', { value: 1200, writable: true });
    wrapper.appendChild(epub);

    expect(controller.findScrollableContainer()).toBe(epub);
  });
});
