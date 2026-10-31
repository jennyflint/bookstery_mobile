import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLongPress } from '../../../app/composables/useLongPress';

describe('useLongPress Composable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should trigger callback after default delay of 500ms', () => {
    const onLongPress = vi.fn();
    const { onPointerDown, isTriggered } = useLongPress(onLongPress, { delay: 500 });

    const event = new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 });
    onPointerDown(event);

    expect(isTriggered.value).toBe(false);
    expect(onLongPress).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(isTriggered.value).toBe(false);
    expect(onLongPress).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(isTriggered.value).toBe(true);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('should cancel callback if pointer moves beyond slop threshold', () => {
    const onLongPress = vi.fn();
    const { onPointerDown, onPointerMove, isTriggered } = useLongPress(onLongPress, {
      delay: 500,
      slop: 10,
    });

    const startEvent = new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 });
    onPointerDown(startEvent);

    const smallMoveEvent = new PointerEvent('pointermove', { clientX: 105, clientY: 102 });
    onPointerMove(smallMoveEvent);

    vi.advanceTimersByTime(200);

    const largeMoveEvent = new PointerEvent('pointermove', { clientX: 120, clientY: 100 });
    onPointerMove(largeMoveEvent);

    vi.advanceTimersByTime(400);

    expect(isTriggered.value).toBe(false);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('should cancel timer when pointer is released early', () => {
    const onLongPress = vi.fn();
    const { onPointerDown, onPointerUp, isTriggered } = useLongPress(onLongPress, { delay: 500 });

    const startEvent = new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 });
    onPointerDown(startEvent);

    vi.advanceTimersByTime(250);

    onPointerUp();

    vi.advanceTimersByTime(300);

    expect(isTriggered.value).toBe(false);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('should cancel timer on touch cancel event', () => {
    const onLongPress = vi.fn();
    const { onTouchStart, onTouchCancel, isTriggered } = useLongPress(onLongPress, { delay: 500 });

    const touch = { clientX: 50, clientY: 50 } as Touch;
    const touchEvent = { touches: [touch] } as unknown as TouchEvent;

    onTouchStart(touchEvent);

    vi.advanceTimersByTime(200);

    onTouchCancel();

    vi.advanceTimersByTime(400);

    expect(isTriggered.value).toBe(false);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
