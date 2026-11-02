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
});
