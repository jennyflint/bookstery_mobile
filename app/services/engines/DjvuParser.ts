import type { DjVuBookmark, DjVuDocumentProxy, DjVuPageProxy, DjVuTextZone } from '~/types/djvu';

/**
 * Checks whether the given buffer has a valid DjVu IFF85 header (AT&TFORM + DJVU/DJVM).
 */
export function isDjVuBuffer(buffer: Uint8Array): boolean {
  if (!buffer || buffer.byteLength < 16) {
    return false;
  }

  // AT&T magic: 0x41, 0x54, 0x26, 0x54
  const isAtnt =
    buffer[0] === 0x41 &&
    buffer[1] === 0x54 &&
    buffer[2] === 0x26 &&
    buffer[3] === 0x54;

  if (!isAtnt) {
    return false;
  }

  // FORM chunk: 0x46, 0x4f, 0x52, 0x4d
  const isForm =
    buffer[4] === 0x46 &&
    buffer[5] === 0x4f &&
    buffer[6] === 0x52 &&
    buffer[7] === 0x4d;

  if (!isForm) {
    return false;
  }

  // Form type at offset 12..15: DJVU (0x44, 0x4a, 0x56, 0x55) or DJVM (0x44, 0x4a, 0x56, 0x4d)
  const isDjvuOrDjvm =
    buffer[12] === 0x44 &&
    buffer[13] === 0x4a &&
    buffer[14] === 0x56 &&
    (buffer[15] === 0x55 || buffer[15] === 0x4d);

  return isDjvuOrDjvm;
}

interface DjVuLibraryModule {
  Document: new (
    buffer: ArrayBuffer,
    options?: { baseUrl?: string | null; memoryLimit?: number },
  ) => DjVuDocumentProxy;
}

let cachedDjVuLib: DjVuLibraryModule | null = null;

/**
 * Safely loads the DjVu.js library module in both browser and server/test environments.
 */
export async function getDjVuLibrary(): Promise<DjVuLibraryModule> {
  if (cachedDjVuLib) {
    return cachedDjVuLib;
  }

  // Ensure global environment has self and document polyfilled if in headless Node/SSR
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.self === 'undefined') {
      g.self = globalThis;
    }
    if (typeof g.document === 'undefined') {
      g.document = {};
    }
    if (typeof g.ImageData === 'undefined') {
      class MockImageData {
        width: number;
        height: number;
        data: Uint8ClampedArray;
        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
          this.data = new Uint8ClampedArray(width * height * 4);
        }
      }
      g.ImageData = MockImageData;
    }
  }

  // Dynamic import of the library ESM module
  // @ts-ignore djvujs-dist lacks bundled TypeScript declarations
  const mod = await import('djvujs-dist/library/src/index.js');
  cachedDjVuLib = (mod.default || mod) as DjVuLibraryModule;
  return cachedDjVuLib;
}

/**
 * Creates a valid synthetic single-page DjVu byte array with optional embedded text.
 * Used for unit testing and offline/fallback mock documents.
 */
export function createSampleDjvu(
  width = 600,
  height = 800,
  dpi = 100,
  sampleText = 'Bookstery DjVu sample page content for testing.',
): Uint8Array {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(sampleText);

  // 1. Build INFO chunk (10 bytes data)
  // width (2 BE), height (2 BE), minor ver (26), major ver (24), dpi (2 BE), gamma (22), flags (1)
  const infoData = new Uint8Array(10);
  infoData[0] = (width >> 8) & 0xff;
  infoData[1] = width & 0xff;
  infoData[2] = (height >> 8) & 0xff;
  infoData[3] = height & 0xff;
  infoData[4] = 26; // minor version
  infoData[5] = 24; // major version
  infoData[6] = (dpi >> 8) & 0xff;
  infoData[7] = dpi & 0xff;
  infoData[8] = 22; // default gamma
  infoData[9] = 1; // orientation: 1 = normal

  const infoChunk = createIffChunk('INFO', infoData);

  // 2. Build TXTa chunk (raw text zone)
  // Header: textLength (3 bytes BE uint24) + utf8 bytes + version (1 byte = 0x01)
  const txtaPayload = new Uint8Array(3 + textBytes.length + 1);
  const textLen = textBytes.length;
  txtaPayload[0] = (textLen >> 16) & 0xff;
  txtaPayload[1] = (textLen >> 8) & 0xff;
  txtaPayload[2] = textLen & 0xff;
  txtaPayload.set(textBytes, 3);
  txtaPayload[3 + textLen] = 1; // version 1

  const txtaChunk = createIffChunk('TXTa', txtaPayload);

  // 3. Assemble FORM:DJVU payload
  // Form Type: 'DJVU' (4 bytes) + infoChunk + txtaChunk
  const djvuPayloadLen = 4 + infoChunk.length + txtaChunk.length;
  const djvuPayload = new Uint8Array(djvuPayloadLen);
  djvuPayload.set([0x44, 0x4a, 0x56, 0x55], 0); // 'DJVU'
  djvuPayload.set(infoChunk, 4);
  djvuPayload.set(txtaChunk, 4 + infoChunk.length);

  // 4. Wrap with AT&T + FORM
  const formChunk = createIffChunk('FORM', djvuPayload);
  const result = new Uint8Array(4 + formChunk.length);
  result.set([0x41, 0x54, 0x26, 0x54], 0); // 'AT&T'
  result.set(formChunk, 4);

  return result;
}

function createIffChunk(chunkId: string, payload: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(8 + payload.length);
  for (let i = 0; i < 4; i++) {
    chunk[i] = chunkId.charCodeAt(i);
  }
  const len = payload.length;
  chunk[4] = (len >> 24) & 0xff;
  chunk[5] = (len >> 16) & 0xff;
  chunk[6] = (len >> 8) & 0xff;
  chunk[7] = len & 0xff;
  chunk.set(payload, 8);
  return chunk;
}

/**
 * Validates and parses a DjVu document from a Uint8Array or ArrayBuffer.
 */
export async function parseDjVuDocument(data: Uint8Array | ArrayBuffer): Promise<DjVuDocumentProxy> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!isDjVuBuffer(bytes)) {
    throw new Error('Invalid or corrupted DjVu file');
  }

  const lib = await getDjVuLibrary();
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new lib.Document(arrayBuffer);
}
