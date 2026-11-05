import { BaseEngine } from './BaseEngine';
import { MobiParser } from './MobiParser';
import { createRangeFromOffsets } from '../../utils/highlightRenderer';
import type {
  HighlightRecord,
  ReaderLocation,
  ReaderPaginationMode,
  ZoomableContainerElement,
} from '../../types';

export class MobiEngine extends BaseEngine {
  protected override paginationMode: ReaderPaginationMode = 'scroll';
  private paragraphElements: HTMLElement[] = [];
  private currentParagraphIndex: number = 0;
  private scrollContainer: HTMLElement | null = null;
  private scrollHandler: (() => void) | null = null;
  private currentFontSize: number = 18;
  private currentLineHeight: number = 1.6;
  private chapters: Array<{ id: string; title: string; locator: string }> = [];

  override setHighlights(
    highlights: HighlightRecord[],
    onHighlightClick?: (highlight: HighlightRecord) => void,
  ): void {
    super.setHighlights(highlights, onHighlightClick);
    this.restoreHighlights();
  }

  private restoreHighlights(): void {
    if (!this.container || this.paragraphElements.length === 0) return;

    const colorBorderMap: Record<string, { bg: string; border: string }> = {
      yellow: { bg: '#FEF08A', border: '#CA8A04' },
      green: { bg: '#C8E695', border: '#3E5725' },
      pink: { bg: '#FBCFE8', border: '#DB2777' },
      blue: { bg: '#BAE6FD', border: '#0284C7' },
      purple: { bg: '#E9D5FF', border: '#9333EA' },
    };

    const existingMarks = this.container.querySelectorAll('.bookstery-hl');
    existingMarks.forEach((m) => {
      const parent = m.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(m.textContent || ''), m);
        parent.normalize();
      }
    });

    for (const hl of this.highlights) {
      if (hl.format !== 'mobi') continue;
      const textToFind = hl.selected_text.trim();
      if (!textToFind && hl.startOffset === undefined) continue;

      const palette = colorBorderMap[hl.color] || colorBorderMap.green;

      let targetElements: HTMLElement[] = this.paragraphElements;
      if (hl.blockId) {
        const found =
          this.paragraphElements.find(
            (p) =>
              p.getAttribute('data-block-id') === hl.blockId ||
              p.getAttribute('data-message-id') === hl.blockId ||
              p.id === hl.blockId,
          ) ||
          this.container.querySelector<HTMLElement>(
            `[data-block-id="${hl.blockId}"], [data-message-id="${hl.blockId}"], #${hl.blockId}`,
          );
        if (found) {
          targetElements = [found];
        }
      } else if (hl.locator && hl.locator.startsWith('mobi-p-')) {
        const found = this.paragraphElements.find((p) => p.id === hl.locator);
        if (found) {
          targetElements = [found];
        }
      }

      for (const p of targetElements) {
        if (
          hl.partType &&
          p.getAttribute('data-part-type') &&
          p.getAttribute('data-part-type') !== hl.partType
        ) {
          continue;
        }
        let wrapped = false;
        if (hl.startOffset !== undefined && hl.endOffset !== undefined) {
          wrapped = this.wrapRangeInElement(
            p,
            hl.startOffset,
            hl.endOffset,
            hl,
            palette.bg,
            palette.border,
          );
        }
        if (!wrapped) {
          const pText = p.textContent || '';
          if (pText.includes(textToFind)) {
            this.wrapTextInElement(p, textToFind, hl, palette.bg, palette.border);
            break;
          }
        } else {
          break;
        }
      }
    }
  }

  private wrapRangeInElement(
    element: HTMLElement,
    startOffset: number,
    endOffset: number,
    hl: HighlightRecord,
    bg: string,
    border: string,
  ): boolean {
    const range = createRangeFromOffsets(element, startOffset, endOffset);
    if (!range) return false;
    const text = range.toString().trim();
    if (!text) return false;

    const mark = document.createElement('mark');
    mark.className = `bookstery-hl hl-${hl.color} cursor-pointer rounded-xs px-0.5 select-text transition-colors`;
    mark.dataset.highlightId = hl.id;
    mark.style.backgroundColor = bg;
    mark.style.borderBottom = `2px solid ${border}`;
    mark.style.color = 'inherit';

    mark.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onHighlightClickCallback?.(hl);
    });

    try {
      range.surroundContents(mark);
      return true;
    } catch {
      try {
        const extracted = range.extractContents();
        mark.appendChild(extracted);
        range.insertNode(mark);
        return true;
      } catch {
        return false;
      }
    }
  }

  private wrapTextInElement(
    element: HTMLElement,
    text: string,
    hl: HighlightRecord,
    bg: string,
    border: string,
  ): void {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let currentNode = walker.nextNode();

    while (currentNode) {
      const nodeText = currentNode.textContent || '';
      const matchIndex = nodeText.indexOf(text);
      if (matchIndex !== -1) {
        const range = document.createRange();
        range.setStart(currentNode, matchIndex);
        range.setEnd(currentNode, matchIndex + text.length);

        const mark = document.createElement('mark');
        mark.className = `bookstery-hl hl-${hl.color} cursor-pointer rounded-xs px-0.5 select-text transition-colors`;
        mark.dataset.highlightId = hl.id;
        mark.style.backgroundColor = bg;
        mark.style.borderBottom = `2px solid ${border}`;
        mark.style.color = 'inherit';

        mark.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onHighlightClickCallback?.(hl);
        });

        try {
          range.surroundContents(mark);
        } catch {
          mark.textContent = text;
          const afterText = nodeText.substring(matchIndex + text.length);
          currentNode.textContent = nodeText.substring(0, matchIndex);
          currentNode.parentNode?.insertBefore(mark, currentNode.nextSibling);
          if (afterText) {
            mark.parentNode?.insertBefore(document.createTextNode(afterText), mark.nextSibling);
          }
        }
        break;
      }
      currentNode = walker.nextNode();
    }
  }

  async init(
    container: HTMLElement,
    data: Uint8Array | ArrayBuffer | string | Blob,
    initialLocator?: string,
  ): Promise<void> {
    this.container = container;
    this.container.innerHTML = '';
    this.paragraphElements = [];
    this.chapters = [];
    this.currentParagraphIndex = 0;

    const buffer = await this.normalizeToUint8Array(data);
    let parsedDoc;
    if (buffer.length < 78) {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(buffer);
      parsedDoc = {
        metadata: { title: 'Document' },
        htmlContent: text.includes('<') ? text : `<p>${text}</p>`,
        chapters: [],
        images: new Map<number, string>(),
        coverDataUrl: null,
      };
    } else {
      parsedDoc = MobiParser.parseDocument(buffer);
    }

    this.renderDocument(parsedDoc.htmlContent);
    this.restoreHighlights();

    if (initialLocator) {
      await this.goTo(initialLocator);
    }
  }

  private async normalizeToUint8Array(
    data: Uint8Array | ArrayBuffer | string | Blob,
  ): Promise<Uint8Array> {
    if (data instanceof Uint8Array) {
      return data;
    }
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      const buf = await data.arrayBuffer();
      return new Uint8Array(buf);
    }
    if (typeof data === 'string') {
      return new TextEncoder().encode(data);
    }
    throw new Error('Unsupported MOBI book data format');
  }

  private renderDocument(htmlContent: string): void {
    if (!this.container) return;

    const wrapper = document.createElement('div');
    wrapper.className =
      'mobi-document-wrapper h-full w-full overflow-y-auto px-6 py-8 select-text';
    this.scrollContainer = wrapper;

    const article = document.createElement('article');
    article.className = 'mobi-content max-w-2xl mx-auto space-y-4';
    article.style.fontSize = `${this.currentFontSize}px`;
    article.style.lineHeight = `${this.currentLineHeight}`;

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // Clean dangerous elements
    doc.querySelectorAll('script, style, link').forEach((el) => el.remove());

    let paragraphCounter = 0;
    const bodyChildren = Array.from(doc.body.children);

    if (bodyChildren.length > 0) {
      for (const node of bodyChildren) {
        paragraphCounter = this.processBlockNode(node, article, paragraphCounter);
      }
    } else {
      // Body has text nodes directly or simple markup
      const rawText = (doc.body.textContent || '').trim();
      if (rawText) {
        const parts = rawText.split(/\n\s*\n|\r\n\s*\r\n/);
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          const p = document.createElement('p');
          p.id = `mobi-p-${paragraphCounter}`;
          p.setAttribute('data-block-id', `mobi-p-${paragraphCounter}`);
          p.className = 'mobi-paragraph text-[length:inherit] leading-[inherit] cursor-text';
          p.textContent = trimmed;
          article.appendChild(p);
          this.paragraphElements.push(p);
          paragraphCounter++;
        }
      }
    }

    wrapper.appendChild(article);
    this.container.appendChild(wrapper);

    const zoomableContainer = this.container as unknown as ZoomableContainerElement;
    if (zoomableContainer) {
      zoomableContainer.__readerGetScrollContainer = () => this.scrollContainer;
      zoomableContainer.__readerGetContentSize = () => ({
        width: this.scrollContainer?.scrollWidth || 0,
        height: this.scrollContainer?.scrollHeight || 0,
      });
    }

    this.scrollHandler = () => {
      this.updateLocationOnScroll();
    };
    wrapper.addEventListener('scroll', this.scrollHandler, { passive: true });

    this.updateLocationOnScroll();
  }

  private processBlockNode(
    node: Element,
    article: HTMLElement,
    counter: number,
  ): number {
    const tagName = node.tagName.toLowerCase();

    // Check headings
    if (/^h[1-6]$/.test(tagName)) {
      const heading = document.createElement(tagName);
      heading.id = `mobi-p-${counter}`;
      heading.setAttribute('data-block-id', `mobi-p-${counter}`);
      heading.className =
        'mobi-paragraph font-bold tracking-tight text-[length:inherit] leading-[inherit] cursor-text my-4';
      heading.innerHTML = node.innerHTML;
      article.appendChild(heading);
      this.paragraphElements.push(heading);

      const titleText = heading.textContent?.trim() || '';
      if (titleText) {
        this.chapters.push({
          id: `mobi-ch-${this.chapters.length}`,
          title: titleText,
          locator: heading.id,
        });
      }
      return counter + 1;
    }

    // Check images
    if (tagName === 'img') {
      const img = node.cloneNode(true) as HTMLImageElement;
      img.id = `mobi-p-${counter}`;
      img.setAttribute('data-block-id', `mobi-p-${counter}`);
      img.classList.add('max-w-full', 'my-4', 'rounded', 'mx-auto', 'block');
      article.appendChild(img);
      this.paragraphElements.push(img);
      return counter + 1;
    }

    // Check blockquote, pre
    if (tagName === 'blockquote' || tagName === 'pre') {
      const block = document.createElement(tagName);
      block.id = `mobi-p-${counter}`;
      block.setAttribute('data-block-id', `mobi-p-${counter}`);
      block.className =
        'mobi-paragraph border-l-4 border-zinc-300 pl-4 italic text-[length:inherit] leading-[inherit] cursor-text my-4';
      block.innerHTML = node.innerHTML;
      article.appendChild(block);
      this.paragraphElements.push(block);
      return counter + 1;
    }

    // Check containers like div, section, article: if they have child block elements, recurse
    const childBlocks = node.querySelectorAll(
      'p, h1, h2, h3, h4, h5, h6, blockquote, img, div',
    );
    if (childBlocks.length > 0 && tagName !== 'p') {
      let currentCounter = counter;
      for (const child of Array.from(node.children)) {
        currentCounter = this.processBlockNode(child, article, currentCounter);
      }
      return currentCounter;
    }

    // Standard paragraph or div without nested blocks
    const p = document.createElement('p');
    p.id = `mobi-p-${counter}`;
    p.setAttribute('data-block-id', `mobi-p-${counter}`);
    p.className = 'mobi-paragraph text-[length:inherit] leading-[inherit] cursor-text';
    p.innerHTML = node.innerHTML;
    article.appendChild(p);
    this.paragraphElements.push(p);
    return counter + 1;
  }

  private calculateTotalPages(): number {
    if (!this.scrollContainer || this.paragraphElements.length === 0) {
      return 1;
    }
    const containerHeight =
      this.scrollContainer.clientHeight ||
      (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 600);
    const scrollHeight = this.scrollContainer.scrollHeight;
    if (scrollHeight > containerHeight && containerHeight > 0) {
      return Math.max(1, Math.ceil(scrollHeight / containerHeight));
    }
    return Math.max(1, Math.ceil(this.paragraphElements.length / 5));
  }

  private updateLocationOnScroll(): void {
    if (!this.scrollContainer || this.paragraphElements.length === 0) {
      return;
    }

    const containerTop = this.scrollContainer.scrollTop;
    const containerHeight =
      this.scrollContainer.clientHeight ||
      (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 600);
    const scrollHeight = this.scrollContainer.scrollHeight;

    const hasLayoutHeights = this.paragraphElements.some((p) => p.offsetTop > 0);
    if (hasLayoutHeights) {
      for (let i = 0; i < this.paragraphElements.length; i++) {
        const p = this.paragraphElements[i];
        if (p.offsetTop >= containerTop) {
          this.currentParagraphIndex = i;
          break;
        }
      }
    }

    const maxScroll = Math.max(0, scrollHeight - containerHeight);
    const totalPages = this.calculateTotalPages();

    let progress = 0;
    let currentPage = 1;

    if (maxScroll > 0) {
      progress = Number(((containerTop / maxScroll) * 100).toFixed(2));
      currentPage =
        totalPages > 1
          ? Math.min(
              totalPages,
              Math.max(1, Math.round((progress / 100) * (totalPages - 1)) + 1),
            )
          : 1;
    } else if (this.paragraphElements.length > 1) {
      progress = Number(
        (
          (this.currentParagraphIndex / (this.paragraphElements.length - 1)) *
          100
        ).toFixed(2),
      );
      currentPage =
        totalPages > 1
          ? Math.min(
              totalPages,
              Math.max(
                1,
                Math.round(
                  (this.currentParagraphIndex / (this.paragraphElements.length - 1)) *
                    (totalPages - 1),
                ) + 1,
              ),
            )
          : 1;
    }

    let chapterTitle: string | null = null;
    const currentElem = this.paragraphElements[this.currentParagraphIndex];
    if (currentElem) {
      // Check nearest preceding heading in chapters
      for (let i = this.currentParagraphIndex; i >= 0; i--) {
        const el = this.paragraphElements[i];
        if (/^H[1-6]$/i.test(el.tagName) && el.textContent) {
          chapterTitle = el.textContent.trim();
          break;
        }
      }
    }

    this.location = {
      locator: currentElem ? currentElem.id : `mobi-p-${this.currentParagraphIndex}`,
      progressPercentage: Math.min(Math.max(progress, 0), 100),
      currentPage,
      totalPages,
      chapterTitle,
    };
    this.onLocationChange?.(this.location);
  }

  async goTo(locator: string): Promise<void> {
    if (!this.scrollContainer || !locator) {
      return;
    }

    // 1. Direct paragraph element by id (e.g. "mobi-p-42")
    const target = this.paragraphElements.find((p) => p.id === locator);
    if (target) {
      const topOffset = Math.max(0, target.offsetTop - 16);
      if (typeof this.scrollContainer.scrollTo === 'function') {
        this.scrollContainer.scrollTo({
          top: topOffset,
          behavior: 'auto',
        });
      }
      this.scrollContainer.scrollTop = topOffset;

      const index = this.paragraphElements.indexOf(target);
      if (index !== -1) {
        this.currentParagraphIndex = index;
      }
      this.updateLocationOnScroll();
      return;
    }

    // 2. Numeric page number or percentage (e.g. "5" or "50%")
    const isPercentage = locator.endsWith('%');
    const numericValue = parseFloat(locator);
    if (!isNaN(numericValue) && !locator.startsWith('mobi-p-')) {
      const containerHeight =
        this.scrollContainer.clientHeight ||
        (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 600);
      const scrollHeight = this.scrollContainer.scrollHeight;
      const maxScroll = Math.max(0, scrollHeight - containerHeight);
      const totalPages = this.calculateTotalPages();

      let targetScroll = 0;
      if (isPercentage) {
        targetScroll = Math.max(0, Math.min(maxScroll, (numericValue / 100) * maxScroll));
        if (this.paragraphElements.length > 0) {
          this.currentParagraphIndex = Math.min(
            this.paragraphElements.length - 1,
            Math.max(
              0,
              Math.round((numericValue / 100) * (this.paragraphElements.length - 1)),
            ),
          );
        }
      } else {
        const targetPage = Math.max(1, Math.min(totalPages, Math.round(numericValue)));
        if (totalPages > 1 && maxScroll > 0) {
          targetScroll = ((targetPage - 1) / (totalPages - 1)) * maxScroll;
        } else if (this.paragraphElements.length > 0) {
          const targetParaIndex = Math.min(
            this.paragraphElements.length - 1,
            Math.max(
              0,
              Math.round(
                ((targetPage - 1) / Math.max(1, totalPages - 1)) *
                  (this.paragraphElements.length - 1),
              ),
            ),
          );
          const pElem = this.paragraphElements[targetParaIndex];
          if (pElem) {
            targetScroll = Math.max(0, pElem.offsetTop - 16);
          }
          this.currentParagraphIndex = targetParaIndex;
        }
      }

      if (typeof this.scrollContainer.scrollTo === 'function') {
        this.scrollContainer.scrollTo({
          top: targetScroll,
          behavior: 'auto',
        });
      }
      this.scrollContainer.scrollTop = targetScroll;

      this.updateLocationOnScroll();
      return;
    }
  }

  async next(): Promise<void> {
    if (!this.scrollContainer) return;
    const current = this.scrollContainer.scrollTop;
    const pageDelta =
      (this.scrollContainer.clientHeight ||
        (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 600)) *
      0.9;
    this.scrollContainer.scrollTo({
      top: current + pageDelta,
      behavior: 'smooth',
    });
    setTimeout(() => this.updateLocationOnScroll(), 100);
  }

  async prev(): Promise<void> {
    if (!this.scrollContainer) return;
    const current = this.scrollContainer.scrollTop;
    const pageDelta =
      (this.scrollContainer.clientHeight ||
        (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 600)) *
      0.9;
    this.scrollContainer.scrollTo({
      top: Math.max(0, current - pageDelta),
      behavior: 'smooth',
    });
    setTimeout(() => this.updateLocationOnScroll(), 100);
  }

  override setPaginationMode(mode: ReaderPaginationMode): void {
    this.paginationMode = mode;
  }

  applyTheme(colors: { bg: string; text: string }): void {
    if (this.scrollContainer) {
      this.scrollContainer.style.backgroundColor = colors.bg;
      this.scrollContainer.style.color = colors.text;
    }
  }

  override setFontSize(size: number): void {
    this.currentFontSize = Math.min(Math.max(Math.round(size), 12), 36);
    if (this.scrollContainer) {
      this.scrollContainer.style.fontSize = `${this.currentFontSize}px`;
      const article = this.scrollContainer.querySelector('article');
      if (article) {
        (article as HTMLElement).style.fontSize = `${this.currentFontSize}px`;
      }
    }
  }

  override getCurrentLocation(): ReaderLocation {
    const totalPages = this.calculateTotalPages();
    return {
      ...this.location,
      currentPage: this.location.currentPage || 1,
      totalPages: this.location.totalPages || totalPages,
    };
  }

  getCurrentPageText(): string {
    if (!this.scrollContainer) return '';
    return this.scrollContainer.textContent || '';
  }

  highlightTtsSentence(sentenceText: string, _sentenceIndex: number): void {
    this.clearTtsHighlight();
    if (!this.scrollContainer || !sentenceText) return;

    const cleanTarget = sentenceText.trim().toLowerCase();
    const targetWords = cleanTarget
      .split(/\s+/)
      .map((w) => w.replace(/[.,!?;:«»""''()]/g, ''))
      .filter((w) => w.length > 2);

    const paragraphs = Array.from(
      this.scrollContainer.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6, div'),
    );
    for (const p of paragraphs) {
      const pText = (p.textContent || '').toLowerCase();
      if (
        pText.includes(cleanTarget) ||
        (targetWords.length > 0 && targetWords.every((w) => pText.includes(w)))
      ) {
        p.classList.add('tts-active-span');
        p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
    }
  }

  clearTtsHighlight(): void {
    if (!this.scrollContainer) return;
    const highlighted = this.scrollContainer.querySelectorAll('.tts-active-span');
    highlighted.forEach((el) => el.classList.remove('tts-active-span'));
  }

  override destroy(): void {
    this.clearTtsHighlight();
    if (this.scrollContainer && this.scrollHandler) {
      this.scrollContainer.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
    }
    this.paragraphElements = [];
    this.chapters = [];
    this.scrollContainer = null;
    if (this.container) {
      delete (this.container as unknown as ZoomableContainerElement)
        .__readerGetScrollContainer;
      delete (this.container as unknown as ZoomableContainerElement)
        .__readerGetContentSize;
    }
    super.destroy();
  }
}
