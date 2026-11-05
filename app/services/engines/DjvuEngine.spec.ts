import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DjvuEngine } from './DjvuEngine';
import { createSampleDjvu, isDjVuBuffer } from './DjvuParser';
import type { HighlightRecord } from '~/types';

describe('DjvuParser', () => {
  it('identifies valid DjVu header', () => {
    const djvuBytes = createSampleDjvu(200, 300, 100, 'Test page');
    expect(isDjVuBuffer(djvuBytes)).toBe(true);
  });

  it('rejects non-DjVu buffers', () => {
    const invalid = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    expect(isDjVuBuffer(invalid)).toBe(false);

    const wrongMagic = new Uint8Array(16);
    wrongMagic.set([0x41, 0x54, 0x26, 0x54, 0x46, 0x4f, 0x52, 0x4d, 0, 0, 0, 4, 0x50, 0x44, 0x46, 0x20]);
    expect(isDjVuBuffer(wrongMagic)).toBe(false);
  });
});

describe('DjvuEngine', () => {
  let container: HTMLDivElement;
  let engine: DjvuEngine;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '360px';
    container.style.height = '640px';
    document.body.appendChild(container);
    engine = new DjvuEngine();
  });

  afterEach(() => {
    engine.destroy();
    container.remove();
  });

  it('throws an error on corrupted/invalid DjVu data', async () => {
    const invalidData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await expect(engine.init(container, invalidData)).rejects.toThrow(
      'Invalid or corrupted DjVu file',
    );
  });

  it('initializes in continuous scroll mode by default', async () => {
    const sample = createSampleDjvu(400, 600, 100, 'Continuous scroll test text');
    await engine.init(container, sample, '1');

    const scrollContainer = container.querySelector('.djvu-scroll-container');
    expect(scrollContainer).not.toBeNull();

    const slots = container.querySelectorAll('.djvu-page-slot');
    expect(slots.length).toBeGreaterThanOrEqual(1);

    const loc = engine.getCurrentLocation();
    expect(loc.locator).toBe('1');
    expect(loc.progressPercentage).toBeGreaterThanOrEqual(0);
  });

  it('binds ZoomableContainerElement interface to container and unbinds on destroy', async () => {
    const sample = createSampleDjvu(400, 600, 100, 'Zoom interface test');
    await engine.init(container, sample, '1');

    const zoomable = container as any;
    expect(zoomable.__readerSetZoom).toBeDefined();
    expect(zoomable.__readerResetZoom).toBeDefined();
    expect(zoomable.__readerCanRenderZoom).toBeDefined();
    expect(zoomable.__readerGetScrollContainer).toBeDefined();
    expect(zoomable.__readerGetContentSize).toBeDefined();

    const scrollEl = zoomable.__readerGetScrollContainer();
    expect(scrollEl).toBe(container.querySelector('.djvu-scroll-container'));

    engine.destroy();
    expect(zoomable.__readerSetZoom).toBeUndefined();
    expect(zoomable.__readerResetZoom).toBeUndefined();
    expect(zoomable.__readerCanRenderZoom).toBeUndefined();
    expect(zoomable.__readerGetScrollContainer).toBeUndefined();
    expect(zoomable.__readerGetContentSize).toBeUndefined();
  });

  it('supports pagination modes and navigation (buttons/paginated mode)', async () => {
    const sample = createSampleDjvu(400, 600, 100, 'Buttons mode text');
    engine.setPaginationMode('buttons');
    await engine.init(container, sample, '1');

    const buttonsViewport = container.querySelector('.djvu-buttons-viewport');
    expect(buttonsViewport).not.toBeNull();

    const locChangeSpy = vi.fn();
    engine.onLocationChange = locChangeSpy;

    await engine.goTo('1');
    expect(engine.getCurrentLocation().locator).toBe('1');
  });

  it('applies dark theme filter to canvas', async () => {
    const sample = createSampleDjvu(400, 600, 100, 'Theme test text');
    await engine.init(container, sample, '1');

    // Simulate canvas presence
    const canvas = document.createElement('canvas');
    canvas.className = 'djvu-page-canvas';
    container.querySelector('.djvu-page-slot')?.appendChild(canvas);

    // Apply dark theme
    engine.applyTheme({ bg: '#18181b', text: '#f4f4f5' });
    expect(canvas.style.filter).toBe('invert(0.92) hue-rotate(180deg)');

    // Apply light theme
    engine.applyTheme({ bg: '#ffffff', text: '#18181b' });
    expect(canvas.style.filter).toBe('none');
  });

  it('handles zoom factor in buttons mode', async () => {
    const sample = createSampleDjvu(400, 600, 100, 'Zoom factor test');
    engine.setPaginationMode('buttons');
    await engine.init(container, sample, '1');

    expect(engine.getZoom()).toBe(1.0);
    await engine.setZoom(2.0);
    expect(engine.getZoom()).toBe(2.0);

    engine.resetZoom();
    expect(engine.getZoom()).toBe(1.0);
  });

  it('handles TTS sentence highlighting and clearing', async () => {
    const sample = createSampleDjvu(400, 600, 100, 'The quick brown fox jumps over the lazy dog');
    await engine.init(container, sample, '1');

    const slot = container.querySelector('.djvu-page-slot');
    const textLayer = document.createElement('div');
    textLayer.className = 'djvu-text-layer';

    const span = document.createElement('span');
    span.className = 'djvu-text-zone';
    span.textContent = 'The quick brown fox';
    textLayer.appendChild(span);
    slot?.appendChild(textLayer);

    engine.highlightTtsSentence('The quick brown fox', 0);
    expect(span.classList.contains('djvu-tts-active')).toBe(true);

    engine.clearTtsHighlight();
    expect(span.classList.contains('djvu-tts-active')).toBe(false);
  });

  it('supports highlights restoration', async () => {
    const sample = createSampleDjvu(400, 600, 100, 'Highlighted DjVu text');
    await engine.init(container, sample, '1');

    const slot = container.querySelector('.djvu-page-slot');
    const textLayer = document.createElement('div');
    textLayer.className = 'djvu-text-layer';

    const span = document.createElement('span');
    span.className = 'djvu-text-zone';
    span.textContent = 'Highlighted DjVu text';
    span.style.left = '5%';
    span.style.top = '10%';
    span.style.width = '50%';
    span.style.height = '5%';
    textLayer.appendChild(span);
    slot?.appendChild(textLayer);

    const onHlClick = vi.fn();
    const highlights: HighlightRecord[] = [
      {
        id: 'hl-djvu-1',
        book_id: 'book-1',
        format: 'djvu',
        locator: '1',
        selected_text: 'Highlighted DjVu',
        color: 'yellow',
        note: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ];

    engine.setHighlights(highlights, onHlClick);

    const overlay = slot?.querySelector('.djvu-highlight-overlay');
    expect(overlay).not.toBeNull();
  });
});
