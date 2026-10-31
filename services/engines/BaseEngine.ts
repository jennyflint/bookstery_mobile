import type { ReaderEngineInterface, ReaderLocation } from '../../types';

export abstract class BaseEngine implements ReaderEngineInterface {
  protected container: HTMLElement | null = null;
  protected location: ReaderLocation = {
    locator: '1',
    progressPercentage: 0,
  };

  abstract init(container: HTMLElement, data: Uint8Array | ArrayBuffer | string): Promise<void>;
  abstract goTo(locator: string): Promise<void>;
  abstract next(): Promise<void>;
  abstract prev(): Promise<void>;

  getCurrentLocation(): ReaderLocation {
    return { ...this.location };
  }

  destroy(): void {
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }
}
