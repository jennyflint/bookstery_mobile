/**
 * TypeScript types and interfaces for the DjVu document format.
 */

export interface DjVuTextZone {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children?: DjVuTextZone[];
}

export interface DjVuPageInfo {
  pageNumber: number;
  width: number;
  height: number;
  dpi?: number;
  rotation?: 0 | 90 | 180 | 270;
}

export interface DjVuBookmark {
  description: string;
  url: string;
  children?: DjVuBookmark[];
}

export interface DjVuDocumentMetadata {
  pagesCount: number;
  title?: string;
  author?: string;
  isBundled?: boolean;
}

export interface DjVuPageProxy {
  getWidth(): number;
  getHeight(): number;
  getDpi(): number;
  getRotation(): 0 | 90 | 180 | 270;
  getImageData(rotate?: boolean): ImageData;
  createPngObjectUrl(): Promise<{
    url: string;
    byteLength: number;
    width: number;
    height: number;
    dpi: number;
  }>;
  getText(): string;
  getNormalizedTextZones(): DjVuTextZone[] | null;
  reset(): void;
}

export interface DjVuDocumentProxy {
  getPagesQuantity(): number;
  getPagesSizes(): Array<{ width: number; height: number; dpi: number }>;
  isBundled(): boolean;
  getContents(): DjVuBookmark[] | null;
  getPage(pageNumber: number): Promise<DjVuPageProxy>;
  getPageNumberByUrl(url: string): number | null;
}
