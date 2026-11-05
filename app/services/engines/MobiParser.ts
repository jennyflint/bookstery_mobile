import type {
  MobiExthMetadata,
  MobiHeaderInfo,
  MobiParsedDocument,
} from '../../types';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  const len = bytes.length;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    let chunkStr = '';
    for (let j = 0; j < chunk.length; j++) {
      chunkStr += String.fromCharCode(chunk[j]);
    }
    binary += chunkStr;
  }
  return btoa(binary);
}

/**
 * Decompresses a PalmDOC LZ77 compressed byte array.
 */
export function decompressPalmDoc(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  let pos = 0;
  const len = data.length;

  while (pos < len) {
    const byte = data[pos++];
    if (byte === 0x00) {
      output.push(0x00);
    } else if (byte >= 0x01 && byte <= 0x08) {
      for (let i = 0; i < byte && pos < len; i++) {
        output.push(data[pos++]);
      }
    } else if (byte >= 0x09 && byte <= 0x7f) {
      output.push(byte);
    } else if (byte >= 0x80 && byte <= 0xbf) {
      if (pos >= len) break;
      const byte2 = data[pos++];
      const distance = ((byte & 0x3f) << 5) | (byte2 >> 3);
      const copyLen = (byte2 & 0x07) + 3;
      const copyStart = output.length - distance;
      for (let i = 0; i < copyLen; i++) {
        if (copyStart + i >= 0 && copyStart + i < output.length) {
          output.push(output[copyStart + i]);
        } else {
          output.push(0);
        }
      }
    } else if (byte >= 0xc0) {
      output.push(0x20);
      output.push(byte ^ 0x80);
    }
  }

  return new Uint8Array(output);
}

/**
 * Strips variable-length trailing entries from a MOBI text record
 * according to extraDataFlags.
 */
export function stripTrailingDataEntries(data: Uint8Array, flags: number): Uint8Array {
  if (!flags || data.length === 0) {
    return data;
  }

  function getSizeOfTrailingDataEntry(ptr: Uint8Array, size: number): number {
    let bitpos = 0;
    let result = 0;
    if (size <= 0) return 0;
    while (true) {
      const v = ptr[size - 1];
      result |= (v & 0x7f) << bitpos;
      bitpos += 7;
      size -= 1;
      if ((v & 0x80) !== 0 || bitpos >= 28 || size === 0) {
        return result;
      }
    }
  }

  let num = 0;
  let testflags = flags >> 1;
  while (testflags) {
    if (testflags & 1) {
      num += getSizeOfTrailingDataEntry(data, data.length - num);
    }
    testflags >>= 1;
  }

  if (flags & 1) {
    if (data.length - num > 0) {
      num += (data[data.length - num - 1] & 0x03) + 1;
    }
  }

  if (num > 0 && num <= data.length) {
    return data.subarray(0, data.length - num);
  }

  return data;
}

export function detectImageMimeType(data: Uint8Array): string | null {
  if (data.length < 4) return null;
  // JPEG: FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return 'image/png';
  }
  // GIF: 47 49 46
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
    return 'image/gif';
  }
  // WebP: RIFF ... WEBP
  if (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return 'image/webp';
  }
  // BMP: BM
  if (data[0] === 0x42 && data[1] === 0x4d) {
    return 'image/bmp';
  }
  return null;
}

export interface PalmDb {
  records: Uint8Array[];
  recordOffsets: number[];
}

export function parsePalmDb(buffer: Uint8Array): PalmDb {
  if (buffer.length < 78) {
    throw new Error('Invalid PalmDB: buffer is too small');
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const numRecords = view.getUint16(76, false);

  if (buffer.length < 78 + numRecords * 8) {
    throw new Error('Invalid PalmDB: truncated record descriptor table');
  }

  const recordOffsets: number[] = [];
  for (let i = 0; i < numRecords; i++) {
    const offset = view.getUint32(78 + i * 8, false);
    recordOffsets.push(offset);
  }

  const records: Uint8Array[] = [];
  for (let i = 0; i < numRecords; i++) {
    const start = recordOffsets[i];
    const end = i + 1 < numRecords ? recordOffsets[i + 1] : buffer.length;
    if (start > buffer.length || end > buffer.length || start > end) {
      records.push(new Uint8Array(0));
    } else {
      records.push(buffer.subarray(start, end));
    }
  }

  return { records, recordOffsets };
}

export interface ParsedRecord0 {
  palmDoc: {
    compression: number;
    encryptionType: number;
    textLength: number;
    recordCount: number;
    recordSize: number;
  };
  mobi: MobiHeaderInfo;
  exth: MobiExthMetadata;
}

export function parseRecord0(record0: Uint8Array): ParsedRecord0 {
  if (record0.length < 16) {
    throw new Error('Invalid MOBI: Record 0 is too small for PalmDOC header');
  }

  const view = new DataView(record0.buffer, record0.byteOffset, record0.byteLength);

  // PalmDOC Header (16 bytes)
  const compression = view.getUint16(0, false);
  const textLength = view.getUint32(4, false);
  const recordCount = view.getUint16(8, false);
  const recordSize = view.getUint16(10, false);
  const encryptionType = view.getUint16(12, false);

  if (encryptionType !== 0) {
    throw new Error('DRM-protected MOBI/Kindle books are not supported');
  }

  // MOBI Header begins at offset 16
  let encoding = 'utf-8';
  let fullName = '';
  let firstImageIndex = 0xffffffff;
  let exthFlags = 0;
  let extraDataFlags = 0;

  if (record0.length >= 40) {
    const magic = String.fromCharCode(
      record0[16],
      record0[17],
      record0[18],
      record0[19],
    );

    if (magic === 'MOBI') {
      const mobiHeaderLength = view.getUint32(20, false);
      const textEncodingCode = view.getUint32(28, false);
      encoding = textEncodingCode === 65001 ? 'utf-8' : 'windows-1252';

      if (record0.length >= 92) {
        const fullNameOffset = view.getUint32(84, false);
        const fullNameLength = view.getUint32(88, false);
        if (
          fullNameOffset > 0 &&
          fullNameLength > 0 &&
          fullNameOffset + fullNameLength <= record0.length
        ) {
          try {
            const decoder = new TextDecoder(encoding);
            fullName = decoder.decode(
              record0.subarray(fullNameOffset, fullNameOffset + fullNameLength),
            );
          } catch {
            const utf8 = new TextDecoder('utf-8');
            fullName = utf8.decode(
              record0.subarray(fullNameOffset, fullNameOffset + fullNameLength),
            );
          }
        }
      }

      if (record0.length >= 112) {
        firstImageIndex = view.getUint32(108, false);
      }

      if (record0.length >= 132) {
        exthFlags = view.getUint32(128, false);
      }

      if (mobiHeaderLength >= 228 && record0.length >= 244) {
        extraDataFlags = view.getUint16(242, false);
      }
    }
  }

  // Parse EXTH metadata
  const exth: MobiExthMetadata = {};
  const mobiHeaderLength = record0.length >= 24 ? view.getUint32(20, false) : 0;
  const exthOffset = 16 + mobiHeaderLength;

  if ((exthFlags & 0x40) !== 0 && record0.length >= exthOffset + 12) {
    const exthMagic = String.fromCharCode(
      record0[exthOffset],
      record0[exthOffset + 1],
      record0[exthOffset + 2],
      record0[exthOffset + 3],
    );

    if (exthMagic === 'EXTH') {
      const exthRecordCount = view.getUint32(exthOffset + 8, false);
      let curOffset = exthOffset + 12;

      for (let i = 0; i < exthRecordCount && curOffset + 8 <= record0.length; i++) {
        const recordType = view.getUint32(curOffset, false);
        const recordLen = view.getUint32(curOffset + 4, false);

        if (recordLen < 8 || curOffset + recordLen > record0.length) {
          break;
        }

        const dataSlice = record0.subarray(curOffset + 8, curOffset + recordLen);

        switch (recordType) {
          case 100: // Author
            try {
              exth.author = new TextDecoder(encoding).decode(dataSlice).trim();
            } catch {
              exth.author = new TextDecoder('utf-8').decode(dataSlice).trim();
            }
            break;
          case 103: // Description
            try {
              exth.description = new TextDecoder(encoding).decode(dataSlice).trim();
            } catch {
              exth.description = new TextDecoder('utf-8').decode(dataSlice).trim();
            }
            break;
          case 121: // KF8 Boundary index
            if (dataSlice.length >= 4) {
              const dv = new DataView(dataSlice.buffer, dataSlice.byteOffset, dataSlice.byteLength);
              exth.kf8BoundaryIndex = dv.getUint32(0, false);
            }
            break;
          case 201: // Cover offset (relative to firstImageIndex)
            if (dataSlice.length >= 4) {
              const dv = new DataView(dataSlice.buffer, dataSlice.byteOffset, dataSlice.byteLength);
              exth.coverOffset = dv.getUint32(0, false);
            }
            break;
          case 202: // Thumb offset (relative to firstImageIndex)
            if (dataSlice.length >= 4) {
              const dv = new DataView(dataSlice.buffer, dataSlice.byteOffset, dataSlice.byteLength);
              exth.thumbnailOffset = dv.getUint32(0, false);
            }
            break;
          case 503: // Updated title
            try {
              exth.title = new TextDecoder(encoding).decode(dataSlice).trim();
            } catch {
              exth.title = new TextDecoder('utf-8').decode(dataSlice).trim();
            }
            break;
        }

        curOffset += recordLen;
      }
    }
  }

  if (!exth.title && fullName) {
    exth.title = fullName.trim();
  }

  return {
    palmDoc: {
      compression,
      encryptionType,
      textLength,
      recordCount,
      recordSize,
    },
    mobi: {
      compression,
      encryptionType,
      textLength,
      textRecordCount: recordCount,
      recordSize,
      encoding,
      fullName,
      firstImageIndex,
      exthFlags,
      kf8BoundaryIndex: exth.kf8BoundaryIndex,
      extraDataFlags,
    },
    exth,
  };
}

export class MobiParser {
  /**
   * Fast metadata extraction without decompressing all text records.
   */
  static extractMetadata(buffer: Uint8Array): {
    title?: string;
    author?: string;
    description?: string;
  } {
    try {
      const db = parsePalmDb(buffer);
      if (db.records.length === 0) return {};

      // Check Record 0
      const rec0 = parseRecord0(db.records[0]);
      let title = rec0.exth.title || rec0.mobi.fullName;
      let author = rec0.exth.author;
      let description = rec0.exth.description;

      // If dual MOBI/KF8, check if KF8 has updated metadata
      if (
        rec0.exth.kf8BoundaryIndex !== undefined &&
        rec0.exth.kf8BoundaryIndex < db.records.length &&
        rec0.exth.kf8BoundaryIndex !== 0xffffffff
      ) {
        try {
          const kf8Rec0 = parseRecord0(db.records[rec0.exth.kf8BoundaryIndex]);
          if (kf8Rec0.exth.title) title = kf8Rec0.exth.title;
          if (kf8Rec0.exth.author) author = kf8Rec0.exth.author;
          if (kf8Rec0.exth.description) description = kf8Rec0.exth.description;
        } catch {}
      }

      return {
        title: title || undefined,
        author: author || undefined,
        description: description || undefined,
      };
    } catch {
      return {};
    }
  }

  /**
   * Parses complete MOBI / AZW / AZW3 document.
   */
  static parseDocument(buffer: Uint8Array): MobiParsedDocument {
    const db = parsePalmDb(buffer);
    if (db.records.length === 0) {
      throw new Error('PalmDB has no records');
    }

    const rec0 = parseRecord0(db.records[0]);

    // Check if KF8 boundary exists and is valid
    let useKf8 = false;
    let targetRec0 = rec0;
    let textStartIndex = 1;
    let textRecordCount = rec0.palmDoc.recordCount;
    let compression = rec0.palmDoc.compression;
    let extraDataFlags = rec0.mobi.extraDataFlags || 0;
    let encoding = rec0.mobi.encoding;
    let firstImageIndex = rec0.mobi.firstImageIndex;

    if (
      rec0.exth.kf8BoundaryIndex !== undefined &&
      rec0.exth.kf8BoundaryIndex > 0 &&
      rec0.exth.kf8BoundaryIndex < db.records.length &&
      rec0.exth.kf8BoundaryIndex !== 0xffffffff
    ) {
      try {
        const kf8Header = parseRecord0(db.records[rec0.exth.kf8BoundaryIndex]);
        if (kf8Header.palmDoc.recordCount > 0) {
          useKf8 = true;
          targetRec0 = kf8Header;
          textStartIndex = rec0.exth.kf8BoundaryIndex + 1;
          textRecordCount = kf8Header.palmDoc.recordCount;
          compression = kf8Header.palmDoc.compression;
          extraDataFlags = kf8Header.mobi.extraDataFlags || 0;
          encoding = kf8Header.mobi.encoding;
          firstImageIndex = kf8Header.mobi.firstImageIndex;
        }
      } catch {
        // Fall back to MOBI6
      }
    }

    // Extract text records
    const textChunks: string[] = [];
    let textDecoder: TextDecoder;
    try {
      textDecoder = new TextDecoder(encoding);
    } catch {
      textDecoder = new TextDecoder('utf-8');
    }

    for (let i = 0; i < textRecordCount; i++) {
      const recIdx = textStartIndex + i;
      if (recIdx >= db.records.length) break;

      let recBytes = db.records[recIdx];
      if (recBytes.length === 0) continue;

      recBytes = stripTrailingDataEntries(recBytes, extraDataFlags);

      if (compression === 2) {
        recBytes = decompressPalmDoc(recBytes);
      }

      textChunks.push(textDecoder.decode(recBytes));
    }

    let rawHtml = textChunks.join('');

    // Extract embedded images
    const images = new Map<number, string>();
    let coverDataUrl: string | null = null;

    if (firstImageIndex !== 0xffffffff && firstImageIndex < db.records.length) {
      for (let r = firstImageIndex; r < db.records.length; r++) {
        const imgBytes = db.records[r];
        const mime = detectImageMimeType(imgBytes);
        if (mime) {
          const dataUrl = `data:${mime};base64,${uint8ArrayToBase64(imgBytes)}`;
          const relative1Based = r - firstImageIndex + 1;
          const relative0Based = r - firstImageIndex;
          images.set(relative1Based, dataUrl);
          images.set(relative0Based, dataUrl);
          images.set(r, dataUrl);
        }
      }

      // Determine cover image
      const coverOffset = targetRec0.exth.coverOffset ?? rec0.exth.coverOffset;
      const thumbOffset = targetRec0.exth.thumbnailOffset ?? rec0.exth.thumbnailOffset;

      if (coverOffset !== undefined && coverOffset !== 0xffffffff) {
        const coverIdx = firstImageIndex + coverOffset;
        coverDataUrl = images.get(coverIdx) || null;
      }
      if (!coverDataUrl && thumbOffset !== undefined && thumbOffset !== 0xffffffff) {
        const thumbIdx = firstImageIndex + thumbOffset;
        coverDataUrl = images.get(thumbIdx) || null;
      }
      if (!coverDataUrl) {
        // Fallback to the first image in the map
        for (let r = firstImageIndex; r < db.records.length; r++) {
          if (images.has(r)) {
            coverDataUrl = images.get(r) || null;
            break;
          }
        }
      }
    }

    // Rewrite images in HTML content
    rawHtml = rawHtml.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
      let resolvedSrc = '';

      // Check recindex="NNNN"
      const recindexMatch = attrs.match(/recindex=["']?(\d+)["']?/i);
      if (recindexMatch) {
        const idx = parseInt(recindexMatch[1], 10);
        resolvedSrc = images.get(idx) || '';
      }

      // Check kindle:embed:NNNN
      if (!resolvedSrc) {
        const embedMatch = attrs.match(/src=["']kindle:embed:0*(\d+)[^"']*["']/i);
        if (embedMatch) {
          const idx = parseInt(embedMatch[1], 10);
          resolvedSrc = images.get(idx) || '';
        }
      }

      // Check flow:
      if (!resolvedSrc) {
        const flowMatch = attrs.match(/src=["']kindle:flow:0*(\d+)[^"']*["']/i);
        if (flowMatch) {
          const idx = parseInt(flowMatch[1], 10);
          resolvedSrc = images.get(idx) || '';
        }
      }

      if (resolvedSrc) {
        const cleanAttrs = attrs
          .replace(/src=["'][^"']*["']/i, '')
          .replace(/recindex=["'][^"']*["']/i, '')
          .trim();
        return `<img src="${resolvedSrc}" class="max-w-full my-4 rounded mx-auto" ${cleanAttrs} />`;
      }

      return match;
    });

    // Parse chapters / TOC and paragraphs
    const chapters: Array<{ id: string; title: string; locator: string }> = [];

    const metadata: MobiExthMetadata = {
      title: targetRec0.exth.title || rec0.exth.title || rec0.mobi.fullName,
      author: targetRec0.exth.author || rec0.exth.author,
      description: targetRec0.exth.description || rec0.exth.description,
      coverOffset: targetRec0.exth.coverOffset ?? rec0.exth.coverOffset,
      thumbnailOffset: targetRec0.exth.thumbnailOffset ?? rec0.exth.thumbnailOffset,
      kf8BoundaryIndex: targetRec0.exth.kf8BoundaryIndex ?? rec0.exth.kf8BoundaryIndex,
    };

    return {
      metadata,
      htmlContent: rawHtml,
      chapters,
      images,
      coverDataUrl,
    };
  }
}

export interface CreateSampleMobiOptions {
  title?: string;
  author?: string;
  description?: string;
  htmlContent?: string;
  imageBytes?: Uint8Array;
  compression?: number;
}

export function createSampleMobi(options: CreateSampleMobiOptions = {}): Uint8Array {
  const title = options.title || 'Sample Mobi Book';
  const author = options.author || 'Author Name';
  const description = options.description || 'Description text';
  const html =
    options.htmlContent ||
    `<html><body><h1>Chapter 1</h1><p>Welcome to reading ${title}.</p></body></html>`;
  const compression = options.compression ?? 1;

  const encoder = new TextEncoder();
  const rawTextBytes = encoder.encode(html);
  let textBytes = rawTextBytes;
  if (compression === 2) {
    const compressed: number[] = [];
    let p = 0;
    while (p < rawTextBytes.length) {
      const remaining = rawTextBytes.length - p;
      const chunkLen = Math.min(8, remaining);
      compressed.push(chunkLen);
      for (let i = 0; i < chunkLen; i++) {
        compressed.push(rawTextBytes[p++]);
      }
    }
    textBytes = new Uint8Array(compressed);
  }

  const exthRecords: Uint8Array[] = [];
  const addExthRecord = (type: number, data: Uint8Array) => {
    const len = 8 + data.length;
    const rec = new Uint8Array(len);
    const dv = new DataView(rec.buffer);
    dv.setUint32(0, type, false);
    dv.setUint32(4, len, false);
    rec.set(data, 8);
    exthRecords.push(rec);
  };

  const authorBytes = encoder.encode(author);
  addExthRecord(100, authorBytes);

  const descBytes = encoder.encode(description);
  addExthRecord(103, descBytes);

  const titleBytes = encoder.encode(title);
  addExthRecord(503, titleBytes);

  const hasImage = Boolean(options.imageBytes && options.imageBytes.length > 0);
  if (hasImage) {
    const coverOffsetRec = new Uint8Array(4);
    new DataView(coverOffsetRec.buffer).setUint32(0, 0, false);
    addExthRecord(201, coverOffsetRec);
  }

  let totalExthRecLen = 0;
  for (const r of exthRecords) totalExthRecLen += r.length;
  const exthHeaderLen = 12 + totalExthRecLen;
  const paddingLen = (4 - (exthHeaderLen % 4)) % 4;
  const exthBlock = new Uint8Array(exthHeaderLen + paddingLen);
  exthBlock.set([0x45, 0x58, 0x54, 0x48], 0);
  const exthView = new DataView(exthBlock.buffer);
  exthView.setUint32(4, exthBlock.length, false);
  exthView.setUint32(8, exthRecords.length, false);
  let exthOffset = 12;
  for (const r of exthRecords) {
    exthBlock.set(r, exthOffset);
    exthOffset += r.length;
  }

  const mobiHeaderLength = 232;
  const fullNameOffsetInRec0 = 16 + mobiHeaderLength + exthBlock.length;
  const rec0Length = fullNameOffsetInRec0 + titleBytes.length;
  const record0 = new Uint8Array(rec0Length);
  const rec0View = new DataView(record0.buffer);

  rec0View.setUint16(0, compression, false);
  rec0View.setUint32(4, rawTextBytes.length, false);
  rec0View.setUint16(8, 1, false);
  rec0View.setUint16(10, 4096, false);
  rec0View.setUint16(12, 0, false);

  record0.set([0x4d, 0x4f, 0x42, 0x49], 16);
  rec0View.setUint32(20, mobiHeaderLength, false);
  rec0View.setUint32(24, 2, false);
  rec0View.setUint32(28, 65001, false);
  rec0View.setUint32(32, 12345, false);
  rec0View.setUint32(36, 6, false);
  rec0View.setUint32(84, fullNameOffsetInRec0, false);
  rec0View.setUint32(88, titleBytes.length, false);
  rec0View.setUint32(108, hasImage ? 2 : 0xffffffff, false);
  rec0View.setUint32(128, 0x40, false);

  record0.set(exthBlock, 16 + mobiHeaderLength);
  record0.set(titleBytes, fullNameOffsetInRec0);

  const records: Uint8Array[] = [record0, textBytes];
  if (hasImage && options.imageBytes) {
    records.push(options.imageBytes);
  }

  const numRecords = records.length;
  const recordOffsetsTableLen = numRecords * 8;
  const palmDbHeaderLen = 78 + recordOffsetsTableLen + 2;
  let currentOffset = palmDbHeaderLen;
  const recordOffsets: number[] = [];
  for (const r of records) {
    recordOffsets.push(currentOffset);
    currentOffset += r.length;
  }

  const fileBytes = new Uint8Array(currentOffset);
  const fileView = new DataView(fileBytes.buffer);

  const dbNameBytes = encoder.encode(title.slice(0, 31));
  fileBytes.set(dbNameBytes, 0);
  fileBytes.set([0x42, 0x4f, 0x4f, 0x4b], 60);
  fileBytes.set([0x4d, 0x4f, 0x42, 0x49], 64);
  fileView.setUint16(76, numRecords, false);

  for (let i = 0; i < numRecords; i++) {
    fileView.setUint32(78 + i * 8, recordOffsets[i], false);
    fileView.setUint8(78 + i * 8 + 4, 0);
    fileView.setUint8(78 + i * 8 + 5, (i >> 16) & 0xff);
    fileView.setUint8(78 + i * 8 + 6, (i >> 8) & 0xff);
    fileView.setUint8(78 + i * 8 + 7, i & 0xff);
  }

  for (let i = 0; i < numRecords; i++) {
    fileBytes.set(records[i], recordOffsets[i]);
  }

  return fileBytes;
}

