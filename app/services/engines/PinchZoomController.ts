import type { PinchZoomOptions } from '../../types';

const ZOOM_ANIMATION_MS = 250;

export interface PinchZoomStateSnapshot {
  scale: number;
  cssScale: number;
  renderedScale: number;
  translateX: number;
  translateY: number;
  isPinching: boolean;
  isPanning: boolean;
  isAnimating: boolean;
}

export interface GestureTouchPoint {
  clientX: number;
  clientY: number;
}

/** Minimal touch event shape, so events forwarded from iframes can be coordinate-mapped. */
export interface GestureTouchEvent {
  touches: ArrayLike<GestureTouchPoint>;
  changedTouches?: ArrayLike<GestureTouchPoint>;
  cancelable: boolean;
  preventDefault: () => void;
}

export interface PinchZoomControllerConfig extends PinchZoomOptions {
  wrapper: HTMLElement;
  target?: HTMLElement;
  onStateChange?: (state: PinchZoomStateSnapshot) => void;
}

export class PinchZoomController {
  private wrapper: HTMLElement;
  private target: HTMLElement;
  private minScale: number;
  private maxScale: number;
  private doubleTapScale: number;
  private doubleTapDelayMs: number;
  private debounceMs: number;
  private onZoomRender?: (scale: number) => Promise<void> | void;
  private onSwipeNext?: () => void;
  private onSwipePrev?: () => void;
  private isRenderZoomSupported?: () => boolean;
  private getContentSize?: () => { width: number; height: number } | null;
  private onStateChange?: (state: PinchZoomStateSnapshot) => void;

  private scale: number = 1.0;
  private renderedScale: number = 1.0;
  private cssScale: number = 1.0;
  private translateX: number = 0;
  private translateY: number = 0;

  private isPinching: boolean = false;
  private isPanning: boolean = false;
  private isAnimating: boolean = false;
  private didGestureMove: boolean = false;

  private initialPinchDistance: number = 0;
  private initialMidpoint: { x: number; y: number } = { x: 0, y: 0 };
  private pinchStartScale: number = 1.0;
  private pinchStartTranslateX: number = 0;
  private pinchStartTranslateY: number = 0;

  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private lastTouchX: number = 0;
  private lastTouchY: number = 0;
  private panStartX: number = 0;
  private panStartY: number = 0;

  private lastTapTime: number = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchMove: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;
  private boundTouchCancel: (e: TouchEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private externalSourceDisposers: Array<() => void> = [];

  constructor(config: PinchZoomControllerConfig) {
    this.wrapper = config.wrapper;
    this.target = config.target || config.wrapper;
    this.minScale = config.minScale ?? 0.5;
    this.maxScale = config.maxScale ?? 4.0;
    this.doubleTapScale = config.doubleTapScale ?? 2.5;
    this.doubleTapDelayMs = config.doubleTapDelayMs ?? 300;
    this.debounceMs = config.debounceMs ?? 200;
    this.onZoomRender = config.onZoomRender;
    this.onSwipeNext = config.onSwipeNext;
    this.onSwipePrev = config.onSwipePrev;
    this.isRenderZoomSupported = config.isRenderZoomSupported;
    this.getContentSize = config.getContentSize;
    this.onStateChange = config.onStateChange;

    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
    this.boundTouchCancel = this.handleTouchCancel.bind(this);
    this.boundWheel = this.handleWheel.bind(this);

    this.attach();
  }

  private attach(): void {
    this.wrapper.style.touchAction = 'none';
    this.wrapper.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    this.wrapper.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    this.wrapper.addEventListener('touchend', this.boundTouchEnd, { passive: false });
    this.wrapper.addEventListener('touchcancel', this.boundTouchCancel, { passive: false });
    this.wrapper.addEventListener('wheel', this.boundWheel, { passive: false });
    this.applyTransform();
  }

  public setTarget(target: HTMLElement): void {
    this.target = target;
    this.applyTransform();
  }

  public getState(): PinchZoomStateSnapshot {
    return {
      scale: this.scale,
      cssScale: this.cssScale,
      renderedScale: this.renderedScale,
      translateX: this.translateX,
      translateY: this.translateY,
      isPinching: this.isPinching,
      isPanning: this.isPanning,
      isAnimating: this.isAnimating,
    };
  }

  public didInteractRecently(): boolean {
    return this.didGestureMove || this.isPinching || this.isPanning;
  }

  private getViewportDimensions(): { width: number; height: number; left: number; top: number } {
    const rect = this.wrapper.getBoundingClientRect();
    const width =
      rect.width > 0
        ? rect.width
        : this.wrapper.clientWidth > 0
          ? this.wrapper.clientWidth
          : typeof window !== 'undefined' && window.innerWidth > 0
            ? window.innerWidth
            : 360;
    const height =
      rect.height > 0
        ? rect.height
        : this.wrapper.clientHeight > 0
          ? this.wrapper.clientHeight
          : typeof window !== 'undefined' && window.innerHeight > 0
            ? window.innerHeight
            : 640;
    return {
      width,
      height,
      left: rect.left || 0,
      top: rect.top || 0,
    };
  }

  public clampTranslation(
    x: number,
    y: number,
    targetScale: number,
  ): { x: number; y: number } {
    if (targetScale <= 1.0) {
      return { x: 0, y: 0 };
    }
    const { width, height } = this.getViewportDimensions();
    const content = this.getContentSize?.();
    const baseW = content ? content.width : width;
    const baseH = content ? content.height : height;

    const scaledWidth = baseW * targetScale;
    const scaledHeight = baseH * targetScale;

    const maxOffsetX = Math.max(0, (scaledWidth - width) / 2);
    const maxOffsetY = Math.max(0, (scaledHeight - height) / 2);

    return {
      x: Math.min(Math.max(x, -maxOffsetX), maxOffsetX),
      y: Math.min(Math.max(y, -maxOffsetY), maxOffsetY),
    };
  }

  private applyTransform(): void {
    const transformValue = `translate3d(${this.translateX}px, ${this.translateY}px, 0) scale(${this.cssScale})`;
    this.target.style.transform = transformValue;
    this.target.style.transformOrigin = 'center center';
    this.target.style.willChange = 'transform';
    this.target.style.transition = this.isAnimating
      ? `transform ${ZOOM_ANIMATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : 'none';
    this.onStateChange?.(this.getState());
  }

  private clearDebounceTimer(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private scheduleHighResRender(targetScale: number, delayMs: number = this.debounceMs): void {
    this.clearDebounceTimer();
    // Pure GPU CSS transform zoom across all book formats:
    // Engines are never re-rendered during or after zoom gestures unless render zoom is explicitly supported.
    if (!this.isRenderZoomSupported || !this.isRenderZoomSupported()) {
      this.isAnimating = false;
      this.applyTransform();
      return;
    }
    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      if (!this.isRenderZoomSupported || !this.isRenderZoomSupported()) {
        this.isAnimating = false;
        this.applyTransform();
        return;
      }
      try {
        await this.onZoomRender?.(targetScale);
      } finally {
        this.renderedScale = targetScale;
        this.cssScale = 1.0;
        this.isAnimating = false;
        this.applyTransform();
      }
    }, delayMs);
  }

  private startPinch(t1: GestureTouchPoint, t2: GestureTouchPoint): void {
    this.clearDebounceTimer();
    this.isPinching = true;
    this.isPanning = false;
    this.isAnimating = false;
    this.didGestureMove = true;
    this.initialPinchDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    this.initialMidpoint = {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
    this.pinchStartScale = this.scale;
    this.pinchStartTranslateX = this.translateX;
    this.pinchStartTranslateY = this.translateY;
  }

  private handleTouchStart(e: GestureTouchEvent): void {
    if (e.touches.length === 2) {
      if (e.cancelable) {
        e.preventDefault();
      }
      this.startPinch(e.touches[0], e.touches[1]);
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      this.touchStartX = t.clientX;
      this.touchStartY = t.clientY;
      this.lastTouchX = t.clientX;
      this.lastTouchY = t.clientY;
      this.isPinching = false;
      this.didGestureMove = false;

      if (this.scale > 1.0) {
        this.isPanning = true;
        this.isAnimating = false;
        this.panStartX = this.translateX;
        this.panStartY = this.translateY;
      } else {
        this.isPanning = false;
      }
    }
  }

  private handleTouchMove(e: GestureTouchEvent): void {
    if (e.touches.length === 2) {
      if (e.cancelable) {
        e.preventDefault();
      }
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      if (!this.isPinching) {
        this.startPinch(t1, t2);
        return;
      }

      const currentDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const currentMidpoint = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };

      if (this.initialPinchDistance > 0) {
        const pinchRatio = currentDistance / this.initialPinchDistance;
        const rawNextScale = this.pinchStartScale * pinchRatio;
        const nextScale = Number(
          Math.min(Math.max(rawNextScale, this.minScale), this.maxScale).toFixed(4),
        );
        const { width, height, left, top } = this.getViewportDimensions();
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        const focalX = this.initialMidpoint.x - centerX;
        const focalY = this.initialMidpoint.y - centerY;
        const scaleChange = nextScale / this.pinchStartScale;

        const rawTranslateX =
          currentMidpoint.x -
          this.initialMidpoint.x +
          focalX * (1 - scaleChange) +
          this.pinchStartTranslateX * scaleChange;
        const rawTranslateY =
          currentMidpoint.y -
          this.initialMidpoint.y +
          focalY * (1 - scaleChange) +
          this.pinchStartTranslateY * scaleChange;

        const clamped = this.clampTranslation(rawTranslateX, rawTranslateY, nextScale);

        this.scale = nextScale;
        this.cssScale = Number((this.scale / this.renderedScale).toFixed(4));
        this.translateX = Math.round(clamped.x);
        this.translateY = Math.round(clamped.y);
        this.applyTransform();
      }
      return;
    }

    if (e.touches.length === 1 && !this.isPinching) {
      const t = e.touches[0];
      this.lastTouchX = t.clientX;
      this.lastTouchY = t.clientY;
      const deltaX = t.clientX - this.touchStartX;
      const deltaY = t.clientY - this.touchStartY;

      if (Math.hypot(deltaX, deltaY) > 10) {
        this.didGestureMove = true;
      }

      if (this.scale > 1.0 && this.isPanning) {
        if (e.cancelable) {
          e.preventDefault();
        }
        const clamped = this.clampTranslation(
          this.panStartX + deltaX,
          this.panStartY + deltaY,
          this.scale,
        );
        this.translateX = Math.round(clamped.x);
        this.translateY = Math.round(clamped.y);
        this.applyTransform();
      }
    }
  }

  private handleTouchEnd(e: GestureTouchEvent): void {
    if (this.isPinching) {
      if (e.touches.length < 2) {
        this.isPinching = false;
        this.scale = Number(
          Math.min(Math.max(this.scale, this.minScale), this.maxScale).toFixed(4),
        );
        const clamped = this.clampTranslation(this.translateX, this.translateY, this.scale);
        this.translateX = Math.round(clamped.x);
        this.translateY = Math.round(clamped.y);
        this.cssScale = Number((this.scale / this.renderedScale).toFixed(4));
        this.applyTransform();
        if (this.isRenderZoomSupported?.()) {
          this.scheduleHighResRender(this.scale);
        }

        if (e.touches.length === 1 && this.scale > 1.0) {
          this.touchStartX = e.touches[0].clientX;
          this.touchStartY = e.touches[0].clientY;
          this.panStartX = this.translateX;
          this.panStartY = this.translateY;
          this.isPanning = true;
        }
      }
      return;
    }

    if (e.touches.length === 0) {
      this.isPanning = false;
      const changedTouch =
        e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0] : null;
      const endX = changedTouch ? changedTouch.clientX : this.lastTouchX;
      const endY = changedTouch ? changedTouch.clientY : this.lastTouchY;
      const deltaX = endX - this.touchStartX;
      const deltaY = endY - this.touchStartY;
      const totalMove = Math.hypot(deltaX, deltaY);

      if (totalMove < 20 && !this.didGestureMove) {
        this.didGestureMove = false;
        const now = Date.now();
        if (this.lastTapTime > 0 && now - this.lastTapTime <= this.doubleTapDelayMs) {
          if (e.cancelable) {
            e.preventDefault();
          }
          this.lastTapTime = 0;
          this.didGestureMove = true;
          this.handleDoubleTap(endX, endY);
          return;
        }
        this.lastTapTime = now;
        return;
      }

      if (this.scale <= 1.0 && Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        this.lastTapTime = 0;
        this.didGestureMove = true;
        if (deltaX < -50) {
          this.onSwipeNext?.();
        } else if (deltaX > 50) {
          this.onSwipePrev?.();
        }
        setTimeout(() => {
          this.didGestureMove = false;
        }, 150);
      }
    }
  }

  private handleTouchCancel(): void {
    if (this.isPinching) {
      this.isPinching = false;
      this.scale = Number(
        Math.min(Math.max(this.scale, this.minScale), this.maxScale).toFixed(4),
      );
      const clamped = this.clampTranslation(this.translateX, this.translateY, this.scale);
      this.translateX = Math.round(clamped.x);
      this.translateY = Math.round(clamped.y);
      this.cssScale = Number((this.scale / this.renderedScale).toFixed(4));
      this.applyTransform();
      if (this.isRenderZoomSupported?.()) {
        this.scheduleHighResRender(this.scale);
      }
    }
    this.isPanning = false;
  }

  private handleDoubleTap(tapX: number, tapY: number): void {
    this.isAnimating = true;
    if (this.scale !== 1.0) {
      this.scale = 1.0;
      this.translateX = 0;
      this.translateY = 0;
      this.cssScale = Number((1.0 / this.renderedScale).toFixed(4));
      this.applyTransform();
      if (this.isRenderZoomSupported?.()) {
        this.scheduleHighResRender(1.0, this.getAnimatedRenderDelay());
      } else {
        setTimeout(() => {
          this.isAnimating = false;
          this.applyTransform();
        }, ZOOM_ANIMATION_MS);
      }
    } else {
      const targetScale = this.doubleTapScale;
      const { width, height, left, top } = this.getViewportDimensions();
      const centerX = left + width / 2;
      const centerY = top + height / 2;
      const rawX = -(tapX - centerX) * (targetScale - 1);
      const rawY = -(tapY - centerY) * (targetScale - 1);
      const clamped = this.clampTranslation(rawX, rawY, targetScale);

      this.scale = targetScale;
      this.translateX = Math.round(clamped.x);
      this.translateY = Math.round(clamped.y);
      this.cssScale = Number((targetScale / this.renderedScale).toFixed(4));
      this.applyTransform();
      if (this.isRenderZoomSupported?.()) {
        this.scheduleHighResRender(targetScale, this.getAnimatedRenderDelay());
      } else {
        setTimeout(() => {
          this.isAnimating = false;
          this.applyTransform();
        }, ZOOM_ANIMATION_MS);
      }
    }
  }

  /** Re-rendering must not cut the 250ms zoom animation short, or the page visibly jumps. */
  private getAnimatedRenderDelay(): number {
    return Math.max(this.debounceMs, ZOOM_ANIMATION_MS + 20);
  }

  public resetZoom(skipRenderCallback: boolean = false): void {
    this.clearDebounceTimer();
    const wasZoomed = this.scale !== 1.0 || this.renderedScale !== 1.0;
    this.scale = 1.0;
    this.renderedScale = 1.0;
    this.cssScale = 1.0;
    this.translateX = 0;
    this.translateY = 0;
    this.isPinching = false;
    this.isPanning = false;
    this.isAnimating = false;
    this.didGestureMove = false;
    this.applyTransform();
    if (wasZoomed && !skipRenderCallback && this.isRenderZoomSupported?.()) {
      this.onZoomRender?.(1.0);
    }
  }

  public setScale(newScale: number): void {
    const clamped = Number(
      Math.min(Math.max(newScale, this.minScale), this.maxScale).toFixed(4),
    );
    this.scale = clamped;
    this.cssScale = Number((this.scale / this.renderedScale).toFixed(4));
    const clampedTranslation = this.clampTranslation(this.translateX, this.translateY, this.scale);
    this.translateX = Math.round(clampedTranslation.x);
    this.translateY = Math.round(clampedTranslation.y);
    this.applyTransform();
  }

  public zoomIn(step: number = 0.25): void {
    this.setScale(this.scale + step);
  }

  public handleWheel(e: WheelEvent): void {
    if (this.scale <= 1.0) {
      return;
    }
    if (e.cancelable) {
      e.preventDefault();
    }
    // Trackpad pinch-to-zoom (ctrlKey / metaKey)
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = 1 - e.deltaY * 0.01;
      const targetScale = Math.min(Math.max(this.scale * zoomFactor, this.minScale), this.maxScale);
      this.setScale(targetScale);
      return;
    }
    const deltaX = e.deltaX;
    const deltaY = e.deltaY;

    const nextX = this.translateX - deltaX;
    const nextY = this.translateY - deltaY;
    const clamped = this.clampTranslation(nextX, nextY, this.scale);
    this.translateX = Math.round(clamped.x);
    this.translateY = Math.round(clamped.y);
    this.applyTransform();
  }

  public zoomOut(step: number = 0.25): void {
    this.setScale(this.scale - step);
  }

  /**
   * Routes touches from a same-origin iframe document into this controller. Iframe touch
   * events never reach the wrapper, so pinch, pan and double-tap would otherwise be dead
   * over EPUB content. Coordinates are mapped into the top-level viewport.
   */
  public bindExternalTouchSource(doc: Document, frame: HTMLElement): () => void {
    const mapPoints = (list: ArrayLike<GestureTouchPoint> | undefined): GestureTouchPoint[] => {
      const rect = frame.getBoundingClientRect();
      const ratioX = frame.offsetWidth > 0 && rect.width > 0 ? rect.width / frame.offsetWidth : 1;
      const ratioY =
        frame.offsetHeight > 0 && rect.height > 0 ? rect.height / frame.offsetHeight : ratioX;
      return Array.from(list ?? [], (t) => ({
        clientX: rect.left + t.clientX * ratioX,
        clientY: rect.top + t.clientY * ratioY,
      }));
    };

    const forward =
      (handler: (e: GestureTouchEvent) => void) =>
      (e: TouchEvent): void => {
        handler({
          touches: mapPoints(e.touches),
          changedTouches: mapPoints(e.changedTouches),
          cancelable: e.cancelable,
          preventDefault: () => e.preventDefault(),
        });
      };

    const onStart = forward(this.handleTouchStart.bind(this));
    const onMove = forward(this.handleTouchMove.bind(this));
    const onEnd = forward(this.handleTouchEnd.bind(this));
    const onCancel = (): void => this.handleTouchCancel();
    const onWheel = (e: WheelEvent): void => {
      this.handleWheel(e);
    };

    const options: AddEventListenerOptions = { passive: false };
    doc.addEventListener('touchstart', onStart, options);
    doc.addEventListener('touchmove', onMove, options);
    doc.addEventListener('touchend', onEnd, options);
    doc.addEventListener('touchcancel', onCancel, options);
    doc.addEventListener('wheel', onWheel, options);

    const dispose = (): void => {
      doc.removeEventListener('touchstart', onStart);
      doc.removeEventListener('touchmove', onMove);
      doc.removeEventListener('touchend', onEnd);
      doc.removeEventListener('touchcancel', onCancel);
      doc.removeEventListener('wheel', onWheel);
    };
    this.externalSourceDisposers.push(dispose);
    return dispose;
  }

  public destroy(): void {
    this.externalSourceDisposers.forEach((dispose) => dispose());
    this.externalSourceDisposers = [];
    this.clearDebounceTimer();
    this.wrapper.removeEventListener('touchstart', this.boundTouchStart);
    this.wrapper.removeEventListener('touchmove', this.boundTouchMove);
    this.wrapper.removeEventListener('touchend', this.boundTouchEnd);
    this.wrapper.removeEventListener('touchcancel', this.boundTouchCancel);
    this.wrapper.removeEventListener('wheel', this.boundWheel);
  }
}
