import { Directory, Filesystem } from '@capacitor/filesystem';
import type {
  QuoteCardOptions,
  QuoteCardTheme,
  QuoteCardThemeColors,
} from '../../types';

export const THEME_PALETTES: Record<QuoteCardTheme, QuoteCardThemeColors> = {
  sepia: {
    background: '#F4ECD8',
    text: '#3E5725',
    authorText: '#5A7A38',
    quoteMark: 'rgba(62, 87, 37, 0.22)',
    watermark: 'rgba(62, 87, 37, 0.65)',
    mascotColor: '#3E5725',
    cardBorder: 'rgba(62, 87, 37, 0.18)',
  },
  green: {
    background: '#C8E695',
    backgroundSecondary: '#A6C967',
    text: '#22380F',
    authorText: '#35531B',
    quoteMark: 'rgba(34, 56, 15, 0.22)',
    watermark: 'rgba(34, 56, 15, 0.70)',
    mascotColor: '#22380F',
    cardBorder: 'rgba(34, 56, 15, 0.18)',
  },
  oled: {
    background: '#121212',
    text: '#F4ECD8',
    authorText: '#D6CEBA',
    quoteMark: 'rgba(244, 236, 216, 0.20)',
    watermark: 'rgba(244, 236, 216, 0.65)',
    mascotColor: '#C8E695',
    cardBorder: 'rgba(244, 236, 216, 0.12)',
  },
  white: {
    background: '#FFFFFF',
    text: '#18181B',
    authorText: '#71717A',
    quoteMark: 'rgba(24, 24, 27, 0.15)',
    watermark: 'rgba(24, 24, 27, 0.55)',
    mascotColor: '#3E5725',
    cardBorder: 'rgba(24, 24, 27, 0.08)',
  },
};

export class QuoteCardGeneratorService {
  private static instance: QuoteCardGeneratorService | null = null;

  static getInstance(): QuoteCardGeneratorService {
    if (!QuoteCardGeneratorService.instance) {
      QuoteCardGeneratorService.instance = new QuoteCardGeneratorService();
    }
    return QuoteCardGeneratorService.instance;
  }

  async generateCanvas(options: QuoteCardOptions): Promise<HTMLCanvasElement> {
    const isSquare = options.aspectRatio === 'square';
    const width = 1080;
    const height = isSquare ? 1080 : 1350;

    let canvas: HTMLCanvasElement;
    if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
    } else {
      throw new Error('Canvas rendering requires DOM environment');
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to create Canvas 2D context');
    }

    const themeColors = THEME_PALETTES[options.theme] || THEME_PALETTES.sepia;

    this.drawBackground(ctx, width, height, themeColors);
    this.drawDecorativeBorder(ctx, width, height, themeColors);
    this.drawWatermarkAndBranding(ctx, width, height, themeColors);

    const marginX = 110;
    const availableWidth = width - marginX * 2;
    const topArea = 180;
    const bottomArea = height - 320;
    const availableHeight = bottomArea - topArea;

    this.drawQuote(ctx, options.quoteText, width, topArea, availableWidth, availableHeight, themeColors);
    this.drawBookInfo(ctx, options.bookTitle, options.author, width, bottomArea, availableWidth, themeColors);

    return canvas;
  }

  private drawBackground(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    theme: QuoteCardThemeColors,
  ): void {
    if (theme.backgroundSecondary) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, theme.background);
      gradient.addColorStop(1, theme.backgroundSecondary);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = theme.background;
    }
    ctx.fillRect(0, 0, width, height);
  }

  private drawDecorativeBorder(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    theme: QuoteCardThemeColors,
  ): void {
    if (!theme.cardBorder) return;
    const padding = 44;
    ctx.save();
    ctx.strokeStyle = theme.cardBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(padding, padding, width - padding * 2, height - padding * 2);

    const cornerSize = 24;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(padding, padding + cornerSize);
    ctx.lineTo(padding, padding);
    ctx.lineTo(padding + cornerSize, padding);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width - padding - cornerSize, padding);
    ctx.lineTo(width - padding, padding);
    ctx.lineTo(width - padding, padding + cornerSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(padding, height - padding - cornerSize);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(padding + cornerSize, height - padding);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width - padding - cornerSize, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.lineTo(width - padding, height - padding - cornerSize);
    ctx.stroke();

    ctx.restore();
  }

  private drawWatermarkAndBranding(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    theme: QuoteCardThemeColors,
  ): void {
    const bottomY = height - 105;
    ctx.save();

    this.drawMascotEmblem(ctx, width / 2 - 110, bottomY - 14, 28, theme.mascotColor);

    ctx.fillStyle = theme.watermark;
    ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '1.5px';
    ctx.fillText('READ WITH BOOKSTERY', width / 2 - 68, bottomY);

    ctx.restore();
  }

  private drawMascotEmblem(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number,
    color: string,
  ): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(centerX - size * 0.7, centerY - size * 0.4);
    ctx.quadraticCurveTo(centerX, centerY - size * 0.1, centerX + size * 0.7, centerY - size * 0.4);
    ctx.lineTo(centerX + size * 0.7, centerY + size * 0.4);
    ctx.quadraticCurveTo(centerX, centerY + size * 0.7, centerX - size * 0.7, centerY + size * 0.4);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX, centerY - size * 0.1);
    ctx.lineTo(centerX, centerY + size * 0.7);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX + size * 0.2, centerY - size * 0.45, size * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string[] {
    const paragraphs = text.split('\n');
    const lines: string[] = [];

    for (const paragraph of paragraphs) {
      const words = paragraph.trim().split(/\s+/);
      if (words.length === 0 || (words.length === 1 && words[0] === '')) {
        continue;
      }

      let currentLine = words[0];
      for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const testLine = `${currentLine} ${word}`;
        const metrics = ctx.measureText(testLine);
        if (metrics.width <= maxWidth) {
          currentLine = testLine;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }
      lines.push(currentLine);
    }

    return lines;
  }

  private drawQuote(
    ctx: CanvasRenderingContext2D,
    quoteText: string,
    width: number,
    topArea: number,
    availableWidth: number,
    availableHeight: number,
    theme: QuoteCardThemeColors,
  ): void {
    ctx.save();

    let fontSize = 56;
    const minFontSize = 24;
    let lines: string[] = [];
    let lineHeight = fontSize * 1.5;

    while (fontSize >= minFontSize) {
      ctx.font = `italic 500 ${fontSize}px Georgia, "Times New Roman", serif`;
      lines = this.wrapText(ctx, quoteText, availableWidth);
      lineHeight = fontSize * 1.48;
      const totalBlockHeight = lines.length * lineHeight;
      if (totalBlockHeight <= availableHeight - 60) {
        break;
      }
      fontSize -= 3;
    }

    const totalHeight = lines.length * lineHeight;
    const startY = topArea + (availableHeight - totalHeight) / 2 + fontSize * 0.4;

    ctx.fillStyle = theme.quoteMark;
    ctx.font = '800 130px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('“', width / 2, Math.max(topArea - 40, startY - 90));

    ctx.fillStyle = theme.text;
    ctx.font = `italic 500 ${fontSize}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    lines.forEach((line, index) => {
      const lineY = startY + index * lineHeight;
      ctx.fillText(line, width / 2, lineY);
    });

    ctx.restore();
  }

  private drawBookInfo(
    ctx: CanvasRenderingContext2D,
    bookTitle: string,
    author: string | null | undefined,
    width: number,
    bottomArea: number,
    availableWidth: number,
    theme: QuoteCardThemeColors,
  ): void {
    ctx.save();

    const separatorY = bottomArea + 10;
    ctx.strokeStyle = theme.cardBorder || 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 80, separatorY);
    ctx.lineTo(width / 2 + 80, separatorY);
    ctx.stroke();

    ctx.fillStyle = theme.text;
    ctx.font = '700 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let titleText = bookTitle;
    while (ctx.measureText(titleText).width > availableWidth && titleText.length > 5) {
      titleText = titleText.slice(0, -4) + '...';
    }
    ctx.fillText(titleText, width / 2, separatorY + 45);

    if (author) {
      ctx.fillStyle = theme.authorText;
      ctx.font = '500 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(author, width / 2, separatorY + 84);
    }

    ctx.restore();
  }

  async generateDataUrl(options: QuoteCardOptions): Promise<string> {
    const canvas = await this.generateCanvas(options);
    return canvas.toDataURL('image/png', 0.95);
  }

  async generateBlob(options: QuoteCardOptions): Promise<Blob> {
    const canvas = await this.generateCanvas(options);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to generate PNG blob from canvas'));
        }
      }, 'image/png', 0.95);
    });
  }

  async saveToDevice(options: QuoteCardOptions): Promise<string> {
    const dataUrl = await this.generateDataUrl(options);
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');

    const sanitizedTitle = options.bookTitle
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 30);
    const fileName = `quote_${sanitizedTitle}_${Date.now()}.png`;
    const filePath = `quotes/${fileName}`;

    try {
      const result = await Filesystem.writeFile({
        path: filePath,
        data: base64Data,
        directory: Directory.Data,
      });
      return result.uri;
    } catch {
      return filePath;
    }
  }

  async shareQuoteCard(options: QuoteCardOptions): Promise<void> {
    const dataUrl = await this.generateDataUrl(options);
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');

    const fileName = `quote_${Date.now()}.png`;
    const filePath = `cache/${fileName}`;

    let shareUri = '';
    try {
      const writeResult = await Filesystem.writeFile({
        path: filePath,
        data: base64Data,
        directory: Directory.Cache,
      });
      shareUri = writeResult.uri;
    } catch {
      shareUri = filePath;
    }

    const shareTitle = `Quote from ${options.bookTitle}`;

    try {
      const shareModule = await import('@capacitor/share').catch(() => null);
      if (shareModule && shareModule.Share) {
        await shareModule.Share.share({
          title: shareTitle,
          text: `“${options.quoteText}” — ${options.bookTitle}`,
          url: shareUri,
          dialogTitle: shareTitle,
        });
        return;
      }
    } catch {}

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        const blob = await this.generateBlob(options);
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: shareTitle,
            text: `“${options.quoteText}” — ${options.bookTitle}`,
            files: [file],
          });
          return;
        }
      } catch {}
    }

    if (typeof window !== 'undefined') {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
}
