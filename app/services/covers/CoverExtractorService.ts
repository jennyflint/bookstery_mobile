import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import type { BookFormat } from '../../types';
import {
  parsePalmDb,
  parseRecord0,
  detectImageMimeType,
  MobiParser,
} from '../engines/MobiParser';
import { isDjVuBuffer, parseDjVuDocument } from '../engines/DjvuParser';

function initPdfWorker(): void {
  if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
    }
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.trim().replace(/\s/g, '');
  const binaryString = atob(clean);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

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

async function canvasToWebpBytes(
  canvas: HTMLCanvasElement,
  quality: number = 0.8,
): Promise<Uint8Array | null> {
  try {
    if (typeof canvas.toBlob === 'function') {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/webp', quality);
      });
      if (blob) {
        const buffer = await blob.arrayBuffer();
        return new Uint8Array(buffer);
      }
    }
    if (typeof canvas.toDataURL === 'function') {
      const dataUrl = canvas.toDataURL('image/webp', quality);
      if (dataUrl && dataUrl.startsWith('data:')) {
        const base64 = dataUrl.split(',')[1] || '';
        return base64ToUint8Array(base64);
      }
    }
  } catch {}
  return null;
}

async function convertImageBytesToWebP(
  imageData: Uint8Array,
  mimeType: string = 'image/jpeg',
  maxWidth: number = 300,
  quality: number = 0.8,
): Promise<Uint8Array> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return imageData;
  }

  try {
    const base64 = uint8ArrayToBase64(imageData);
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const img = new Image();
    const isLoaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = dataUrl;
      if (img.complete && img.naturalWidth > 0) {
        resolve(true);
      }
      setTimeout(() => resolve(false), 200);
    });

    if (!isLoaded || !img.naturalWidth || !img.naturalHeight) {
      return imageData;
    }

    let targetWidth = img.naturalWidth;
    let targetHeight = img.naturalHeight;
    if (targetWidth > maxWidth) {
      targetHeight = Math.round((targetHeight * maxWidth) / targetWidth);
      targetWidth = maxWidth;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return imageData;
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    const webpBytes = await canvasToWebpBytes(canvas, quality);
    return webpBytes || imageData;
  } catch {
    return imageData;
  }
}

async function normalizeToUint8Array(
  data: Uint8Array | ArrayBuffer | Blob | string,
): Promise<Uint8Array> {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    const buffer = await data.arrayBuffer();
    return new Uint8Array(buffer);
  }
  if (typeof data === 'string') {
    if (data.startsWith('data:')) {
      const base64 = data.split(',')[1] || '';
      return base64ToUint8Array(base64);
    }
    try {
      return base64ToUint8Array(data);
    } catch {
      return new TextEncoder().encode(data);
    }
  }
  throw new Error('Unsupported book data type for cover extraction');
}

function resolveRelativePath(basePath: string, relativePath: string): string {
  const dir = basePath.includes('/') ? basePath.substring(0, basePath.lastIndexOf('/') + 1) : '';
  const combined = dir + relativePath;
  const parts = combined.split('/');
  const resolvedParts: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') {
      continue;
    }
    if (part === '..') {
      resolvedParts.pop();
    } else {
      resolvedParts.push(part);
    }
  }
  return resolvedParts.join('/');
}

function decodeFb2Xml(bytes: Uint8Array): string {
  const utf8Decoder = new TextDecoder('utf-8');
  let decoded = utf8Decoder.decode(bytes);
  const encodingMatch = decoded.slice(0, 200).match(/encoding=["']([^"']+)["']/i);
  if (encodingMatch && encodingMatch[1]) {
    const encoding = encodingMatch[1].toLowerCase();
    if (encoding !== 'utf-8' && encoding !== 'utf8') {
      try {
        const customDecoder = new TextDecoder(encoding);
        decoded = customDecoder.decode(bytes);
      } catch {}
    }
  }
  return decoded;
}

export class CoverExtractorService {
  async extractCover(
    format: BookFormat,
    data: Uint8Array | ArrayBuffer | Blob | string,
  ): Promise<Uint8Array | null> {
    switch (format) {
      case 'pdf':
        return this.extractPdfCover(data);
      case 'epub':
        return this.extractEpubCover(data);
      case 'fb2':
        return this.extractFb2Cover(data);
      case 'mobi':
        return this.extractMobiCover(data);
      case 'djvu':
        return this.extractDjvuCover(data);
      default:
        return null;
    }
  }

  async extractPdfCover(data: Uint8Array | ArrayBuffer | Blob | string): Promise<Uint8Array | null> {
    initPdfWorker();
    const rawBytes = await normalizeToUint8Array(data);
    let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
    let page: pdfjsLib.PDFPageProxy | null = null;

    try {
      const loadingTask = pdfjsLib.getDocument({
        data: rawBytes,
        cMapPacked: true,
      });
      pdfDoc = await loadingTask.promise;

      if (pdfDoc.numPages < 1) {
        return null;
      }

      page = await pdfDoc.getPage(1);
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const scale = unscaledViewport.width > 300 ? 300 / unscaledViewport.width : 1.0;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const canvasContext = canvas.getContext('2d');
      if (!canvasContext) {
        throw new Error('Canvas 2D context unavailable');
      }

      const renderTask = page.render({
        canvasContext,
        viewport,
      });
      await renderTask.promise;

      const webpBytes = await canvasToWebpBytes(canvas, 0.8);
      if (webpBytes && webpBytes.length > 0) {
        return webpBytes;
      }
      return new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
    } finally {
      if (page) {
        try {
          page.cleanup();
        } catch {}
        page = null;
      }
      if (pdfDoc) {
        try {
          await pdfDoc.destroy();
        } catch {}
        pdfDoc = null;
      }
    }
  }

  async extractEpubCover(data: Uint8Array | ArrayBuffer | Blob | string): Promise<Uint8Array | null> {
    const rawBytes = await normalizeToUint8Array(data);
    const zip = await JSZip.loadAsync(rawBytes);

    const containerEntry = zip.file('META-INF/container.xml');
    if (!containerEntry) {
      return null;
    }

    const containerXml = await containerEntry.async('string');
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'application/xml');

    const rootfile = containerDoc.querySelector('rootfile');
    let opfPath = rootfile ? rootfile.getAttribute('full-path') : null;

    if (!opfPath) {
      const opfMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
      if (opfMatch) {
        opfPath = opfMatch[1];
      }
    }

    if (!opfPath) {
      return null;
    }

    let opfEntry = zip.file(opfPath);
    if (!opfEntry) {
      const targetPath = opfPath.toLowerCase();
      const foundName = Object.keys(zip.files).find((k) => k.toLowerCase() === targetPath);
      if (foundName) {
        opfEntry = zip.file(foundName);
      }
    }

    if (!opfEntry) {
      return null;
    }

    const opfXml = await opfEntry.async('string');
    const opfDoc = parser.parseFromString(opfXml, 'application/xml');

    let coverHref: string | null = null;
    let coverMediaType: string | null = null;

    const items = Array.from(opfDoc.querySelectorAll('item'));

    const coverImagePropItem = items.find((item) => {
      const props = item.getAttribute('properties') || '';
      return props.split(/\s+/).includes('cover-image');
    });

    if (coverImagePropItem) {
      coverHref = coverImagePropItem.getAttribute('href');
      coverMediaType = coverImagePropItem.getAttribute('media-type');
    }

    if (!coverHref) {
      const coverIdItem = items.find((item) => {
        const id = (item.getAttribute('id') || '').toLowerCase();
        return id === 'cover' || id === 'cover-image' || id === 'coverimage';
      });
      if (coverIdItem) {
        coverHref = coverIdItem.getAttribute('href');
        coverMediaType = coverIdItem.getAttribute('media-type');
      }
    }

    if (!coverHref) {
      const metaCover = opfDoc.querySelector('meta[name="cover"]');
      if (metaCover) {
        const coverId = metaCover.getAttribute('content');
        if (coverId) {
          const itemByMeta = items.find((item) => item.getAttribute('id') === coverId);
          if (itemByMeta) {
            coverHref = itemByMeta.getAttribute('href');
            coverMediaType = itemByMeta.getAttribute('media-type');
          }
        }
      }
    }

    if (!coverHref) {
      const fallbackImageItem = items.find((item) => {
        const href = (item.getAttribute('href') || '').toLowerCase();
        const media = (item.getAttribute('media-type') || '').toLowerCase();
        return media.startsWith('image/') && href.includes('cover');
      });
      if (fallbackImageItem) {
        coverHref = fallbackImageItem.getAttribute('href');
        coverMediaType = fallbackImageItem.getAttribute('media-type');
      }
    }

    if (!coverHref) {
      return null;
    }

    const resolvedCoverPath = resolveRelativePath(opfPath, decodeURIComponent(coverHref));
    let imageEntry = zip.file(resolvedCoverPath);

    if (!imageEntry) {
      const fileName = resolvedCoverPath.split('/').pop()?.toLowerCase();
      if (fileName) {
        const foundKey = Object.keys(zip.files).find(
          (k) => k.toLowerCase().endsWith(`/${fileName}`) || k.toLowerCase() === fileName,
        );
        if (foundKey) {
          imageEntry = zip.file(foundKey);
        }
      }
    }

    if (!imageEntry) {
      return null;
    }

    const rawImageBytes = await imageEntry.async('uint8array');
    return await convertImageBytesToWebP(rawImageBytes, coverMediaType || 'image/jpeg', 300, 0.8);
  }

  async extractFb2Cover(data: Uint8Array | ArrayBuffer | Blob | string): Promise<Uint8Array | null> {
    const rawBytes = await normalizeToUint8Array(data);
    let xmlString = '';

    const isZip =
      rawBytes.length > 4 &&
      rawBytes[0] === 0x50 &&
      rawBytes[1] === 0x4b &&
      rawBytes[2] === 0x03 &&
      rawBytes[3] === 0x04;

    if (isZip) {
      const zip = await JSZip.loadAsync(rawBytes);
      const fb2EntryKey = Object.keys(zip.files).find((key) => key.toLowerCase().endsWith('.fb2'));
      if (!fb2EntryKey) {
        return null;
      }
      const fb2Entry = zip.file(fb2EntryKey);
      if (!fb2Entry) {
        return null;
      }
      xmlString = await fb2Entry.async('string');
    } else {
      xmlString = decodeFb2Xml(rawBytes);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    if (doc.querySelector('parsererror')) {
      return null;
    }

    const coverpage = doc.querySelector('coverpage');
    if (!coverpage) {
      return null;
    }

    const imageTag = coverpage.querySelector('image');
    if (!imageTag) {
      return null;
    }

    const rawHref =
      imageTag.getAttribute('l:href') ||
      imageTag.getAttribute('xlink:href') ||
      imageTag.getAttribute('href') ||
      '';

    const coverId = rawHref.replace(/^#/, '').trim();
    if (!coverId) {
      return null;
    }

    const binaries = Array.from(doc.querySelectorAll('binary'));
    const targetBinary = binaries.find((bin) => {
      const id = bin.getAttribute('id') || '';
      return id.trim().toLowerCase() === coverId.toLowerCase();
    });

    if (!targetBinary) {
      return null;
    }

    const base64Data = (targetBinary.textContent || '').trim().replace(/\s/g, '');
    if (!base64Data) {
      return null;
    }

    const contentType = targetBinary.getAttribute('content-type') || 'image/jpeg';
    const decodedBytes = base64ToUint8Array(base64Data);
    return await convertImageBytesToWebP(decodedBytes, contentType, 300, 0.8);
  }

  async extractMobiCover(
    data: Uint8Array | ArrayBuffer | Blob | string,
  ): Promise<Uint8Array | null> {
    try {
      const rawBytes = await normalizeToUint8Array(data);
      const parsedDb = parsePalmDb(rawBytes);
      if (parsedDb.records.length === 0) return null;

      const rec0 = parseRecord0(parsedDb.records[0]);
      let targetRec0 = rec0;
      let firstImageIndex = rec0.mobi.firstImageIndex;

      if (
        rec0.exth.kf8BoundaryIndex !== undefined &&
        rec0.exth.kf8BoundaryIndex > 0 &&
        rec0.exth.kf8BoundaryIndex < parsedDb.records.length &&
        rec0.exth.kf8BoundaryIndex !== 0xffffffff
      ) {
        try {
          const kf8Header = parseRecord0(parsedDb.records[rec0.exth.kf8BoundaryIndex]);
          if (kf8Header.mobi.firstImageIndex !== 0xffffffff) {
            targetRec0 = kf8Header;
            firstImageIndex = kf8Header.mobi.firstImageIndex;
          }
        } catch {}
      }

      if (firstImageIndex === 0xffffffff || firstImageIndex >= parsedDb.records.length) {
        return null;
      }

      const coverOffset = targetRec0.exth.coverOffset ?? rec0.exth.coverOffset;
      const thumbOffset = targetRec0.exth.thumbnailOffset ?? rec0.exth.thumbnailOffset;

      let coverBytes: Uint8Array | null = null;
      let coverMime = 'image/jpeg';

      if (coverOffset !== undefined && coverOffset !== 0xffffffff) {
        const idx = firstImageIndex + coverOffset;
        if (idx < parsedDb.records.length) {
          const bytes = parsedDb.records[idx];
          const mime = detectImageMimeType(bytes);
          if (mime) {
            coverBytes = bytes;
            coverMime = mime;
          }
        }
      }

      if (!coverBytes && thumbOffset !== undefined && thumbOffset !== 0xffffffff) {
        const idx = firstImageIndex + thumbOffset;
        if (idx < parsedDb.records.length) {
          const bytes = parsedDb.records[idx];
          const mime = detectImageMimeType(bytes);
          if (mime) {
            coverBytes = bytes;
            coverMime = mime;
          }
        }
      }

      if (!coverBytes) {
        for (let r = firstImageIndex; r < parsedDb.records.length; r++) {
          const bytes = parsedDb.records[r];
          const mime = detectImageMimeType(bytes);
          if (mime) {
            coverBytes = bytes;
            coverMime = mime;
            break;
          }
        }
      }

      if (!coverBytes) {
        return null;
      }

      return await convertImageBytesToWebP(coverBytes, coverMime, 300, 0.8);
    } catch {
      return null;
    }
  }

  async extractDjvuCover(data: Uint8Array | ArrayBuffer | Blob | string): Promise<Uint8Array | null> {
    const rawBytes = await normalizeToUint8Array(data);
    if (!isDjVuBuffer(rawBytes)) {
      return null;
    }

    try {
      const doc = await parseDjVuDocument(rawBytes);
      if (doc.getPagesQuantity() < 1) {
        return null;
      }

      const page = await doc.getPage(1);
      const width = page.getWidth();
      const height = page.getHeight();
      if (width <= 0 || height <= 0) {
        return null;
      }

      const scale = width > 300 ? 300 / width : 1.0;
      const targetWidth = Math.max(1, Math.floor(width * scale));
      const targetHeight = Math.max(1, Math.floor(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return null;
      }

      const imgData = page.getImageData(true);
      if (targetWidth === width && targetHeight === height) {
        ctx.putImageData(imgData, 0, 0);
      } else {
        const off = document.createElement('canvas');
        off.width = width;
        off.height = height;
        const offCtx = off.getContext('2d');
        if (offCtx) {
          offCtx.putImageData(imgData, 0, 0);
          ctx.drawImage(off, 0, 0, targetWidth, targetHeight);
          off.width = 0;
          off.height = 0;
        }
      }

      page.reset();
      const webpBytes = await canvasToWebpBytes(canvas, 0.8);
      canvas.width = 0;
      canvas.height = 0;

      if (webpBytes && webpBytes.length > 0) {
        return webpBytes;
      }
      return new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
    } catch (err) {
      console.error('Failed to extract DjVu cover:', err);
      return null;
    }
  }
}

export function extractMobiMetadata(buffer: Uint8Array): {
  title?: string;
  author?: string;
  description?: string;
} {
  return MobiParser.extractMetadata(buffer);
}

