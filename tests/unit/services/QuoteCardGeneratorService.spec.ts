import { describe, it, expect, beforeEach } from 'vitest';
import { QuoteCardGeneratorService, THEME_PALETTES } from '../../../app/services/export/QuoteCardGeneratorService';
import type { QuoteCardOptions } from '../../../app/types';

describe('QuoteCardGeneratorService', () => {
  let service: QuoteCardGeneratorService;

  beforeEach(() => {
    service = QuoteCardGeneratorService.getInstance();
  });

  it('should generate canvas with portrait 1080x1350 resolution', async () => {
    const options: QuoteCardOptions = {
      theme: 'sepia',
      quoteText: 'The soul becomes dyed with the color of its thoughts.',
      bookTitle: 'Meditations',
      author: 'Marcus Aurelius',
      aspectRatio: 'portrait',
    };

    const canvas = await service.generateCanvas(options);
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1350);
  });

  it('should generate canvas with square 1080x1080 resolution', async () => {
    const options: QuoteCardOptions = {
      theme: 'green',
      quoteText: 'Very short quote.',
      bookTitle: 'Book Title',
      author: 'Author Name',
      aspectRatio: 'square',
    };

    const canvas = await service.generateCanvas(options);
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1080);
  });

  it('should produce data URL starting with data:image/png', async () => {
    const options: QuoteCardOptions = {
      theme: 'oled',
      quoteText: 'You have power over your mind - not outside events.',
      bookTitle: 'Meditations',
      author: 'Marcus Aurelius',
    };

    const dataUrl = await service.generateDataUrl(options);
    expect(dataUrl).toContain('data:image/png;base64');
  });

  it('should have all 4 themes defined with consistent palettes', () => {
    const themes = ['sepia', 'green', 'oled', 'white'] as const;
    themes.forEach((th) => {
      const palette = THEME_PALETTES[th];
      expect(palette).toBeDefined();
      expect(palette.background).toBeDefined();
      expect(palette.text).toBeDefined();
      expect(palette.watermark).toBeDefined();
      expect(palette.mascotColor).toBeDefined();
    });
  });
});
