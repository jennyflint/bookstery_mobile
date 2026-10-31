import { ref } from 'vue';

export interface UseLongPressOptions {
  delay?: number;
  slop?: number;
}

export function useLongPress(
  onLongPress: (event?: TouchEvent | PointerEvent | MouseEvent) => void,
  options: UseLongPressOptions = {},
) {
  const delay = options.delay ?? 500;
  const slop = options.slop ?? 10;

  const isTriggered = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;

  const triggerHaptic = async (): Promise<void> => {
    try {
      const moduleName = ['@capacitor', 'haptics'].join('/');
      const { Haptics, ImpactStyle } = (await import(moduleName)) as {
        Haptics: { impact(opts: { style: string }): Promise<void> };
        ImpactStyle: { Light: string };
      };
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  };

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const start = (
    clientX: number,
    clientY: number,
    event: TouchEvent | PointerEvent | MouseEvent,
  ): void => {
    cancel();
    isTriggered.value = false;
    startX = clientX;
    startY = clientY;

    timer = setTimeout(() => {
      isTriggered.value = true;
      triggerHaptic();
      onLongPress(event);
      timer = null;
    }, delay);
  };

  const move = (clientX: number, clientY: number): void => {
    if (timer === null) {
      return;
    }
    const deltaX = Math.abs(clientX - startX);
    const deltaY = Math.abs(clientY - startY);
    if (deltaX > slop || deltaY > slop) {
      cancel();
    }
  };

  const onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length > 1) {
      cancel();
      return;
    }
    const touch = event.touches[0];
    start(touch.clientX, touch.clientY, event);
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (event.touches.length > 0) {
      const touch = event.touches[0];
      move(touch.clientX, touch.clientY);
    }
  };

  const onTouchEnd = (): void => {
    cancel();
  };

  const onTouchCancel = (): void => {
    cancel();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    start(event.clientX, event.clientY, event);
  };

  const onPointerMove = (event: PointerEvent): void => {
    move(event.clientX, event.clientY);
  };

  const onPointerUp = (): void => {
    cancel();
  };

  const onPointerCancel = (): void => {
    cancel();
  };

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  return {
    isTriggered,
    cancel,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu,
  };
}
