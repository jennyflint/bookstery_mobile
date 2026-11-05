export interface MobiHeaderInfo {
  compression: number;
  encryptionType: number;
  textLength: number;
  textRecordCount: number;
  recordSize: number;
  encoding: string;
  fullName: string;
  firstImageIndex: number;
  exthFlags: number;
  kf8BoundaryIndex?: number;
  extraDataFlags?: number;
}

export interface MobiExthMetadata {
  title?: string;
  author?: string;
  description?: string;
  coverOffset?: number;
  thumbnailOffset?: number;
  kf8BoundaryIndex?: number;
}

export interface MobiParsedDocument {
  metadata: MobiExthMetadata;
  htmlContent: string;
  chapters: Array<{ id: string; title: string; locator: string }>;
  images: Map<number, string>;
  coverDataUrl: string | null;
}
