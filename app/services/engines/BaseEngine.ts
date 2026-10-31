import type {
  HighlightRecord,
  ReaderEngineInterface,
  ReaderLocation,
  ReaderPaginationMode,
} from '../../types';

export abstract class BaseEngine implements ReaderEngineInterface {
  protected container: HTMLElement | null = null;
  protected paginationMode: ReaderPaginationMode = 'scroll';
  public onLocationChange?: (location: ReaderLocation) => void;
  protected highlights: HighlightRecord[] = [];
  protected onHighlightClickCallback?: (highlight: HighlightRecord) => void;

  protected location: ReaderLocation = {
    locator: '1',
    progressPercentage: 0,
  };

  setHighlights(
    highlights: HighlightRecord[],
    onHighlightClick?: (highlight: HighlightRecord) => void,
  ): void {
    this.highlights = highlights;
    this.onHighlightClickCallback = onHighlightClick;
  }

  abstract init(
    container: HTMLElement,
    data: Uint8Array | ArrayBuffer | string | Blob,
    initialLocator?: string,
  ): Promise<void>;
  abstract goTo(locator: string): Promise<void>;
  abstract next(): Promise<void>;
  abstract prev(): Promise<void>;

  setPaginationMode(mode: ReaderPaginationMode): void | Promise<void> {
    this.paginationMode = mode;
  }

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
