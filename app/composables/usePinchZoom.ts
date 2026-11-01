import { ref, onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { PinchZoomController } from '../services/engines/PinchZoomController';
import type { PinchZoomOptions } from '../types';

export function usePinchZoom(
  wrapperRef: Ref<HTMLElement | null>,
  targetRef: Ref<HTMLElement | null>,
  options: PinchZoomOptions = {},
) {
  const scale = ref<number>(1.0);
  const cssScale = ref<number>(1.0);
  const renderedScale = ref<number>(1.0);
  const translateX = ref<number>(0);
  const translateY = ref<number>(0);
  const isPinching = ref<boolean>(false);
  const isPanning = ref<boolean>(false);
  const isAnimating = ref<boolean>(false);

  let controller: PinchZoomController | null = null;

  const initController = (): void => {
    if (!wrapperRef.value) return;
    if (controller) {
      controller.destroy();
      controller = null;
    }

    controller = new PinchZoomController({
      ...options,
      wrapper: wrapperRef.value,
      target: targetRef.value || wrapperRef.value,
      onStateChange: (state) => {
        scale.value = state.scale;
        cssScale.value = state.cssScale;
        renderedScale.value = state.renderedScale;
        translateX.value = state.translateX;
        translateY.value = state.translateY;
        isPinching.value = state.isPinching;
        isPanning.value = state.isPanning;
        isAnimating.value = state.isAnimating;
      },
    });
  };

  const resetZoom = (skipRenderCallback: boolean = false): void => {
    if (controller) {
      controller.resetZoom(skipRenderCallback);
    } else {
      scale.value = 1.0;
      cssScale.value = 1.0;
      renderedScale.value = 1.0;
      translateX.value = 0;
      translateY.value = 0;
      isPinching.value = false;
      isPanning.value = false;
      isAnimating.value = false;
    }
  };

  const setZoom = (targetScale: number): void => {
    if (controller) {
      controller.setScale(targetScale);
    } else {
      scale.value = targetScale;
      cssScale.value = targetScale;
    }
  };

  const zoomIn = (step: number = 0.25): void => {
    if (controller) {
      controller.zoomIn(step);
    } else {
      setZoom(scale.value + step);
    }
  };

  const zoomOut = (step: number = 0.25): void => {
    if (controller) {
      controller.zoomOut(step);
    } else {
      setZoom(scale.value - step);
    }
  };

  const didInteractRecently = (): boolean => {
    return controller?.didInteractRecently() ?? false;
  };

  const bindTouchSource = (doc: Document, frame: HTMLElement): (() => void) => {
    return controller?.bindExternalTouchSource(doc, frame) ?? ((): void => undefined);
  };

  onMounted(() => {
    initController();
  });

  onUnmounted(() => {
    if (controller) {
      controller.destroy();
      controller = null;
    }
  });

  return {
    scale,
    cssScale,
    renderedScale,
    translateX,
    translateY,
    isPinching,
    isPanning,
    isAnimating,
    resetZoom,
    setZoom,
    zoomIn,
    zoomOut,
    didInteractRecently,
    bindTouchSource,
  };
}
