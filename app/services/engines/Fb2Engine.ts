import JSZip from 'jszip';
import { BaseEngine } from './BaseEngine';
import { createRangeFromOffsets } from '../../utils/highlightRenderer';
import type { HighlightRecord, ReaderLocation } from '../../types';

export class Fb2Engine extends BaseEngine {
  private rawXml: string = '';
  private parsedDocument: Document | null = null;
  private paragraphElements: HTMLElement[] = [];
  private currentParagraphIndex: number = 0;
  private scrollContainer: HTMLElement | null = null;
  private scrollHandler: (() => void) | null = null;
  private currentFontSize: number = 18;
  private currentLineHeight: number = 1.6;

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
      if (hl.format !== 'fb2') continue;
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
      } else if (hl.locator && hl.locator.startsWith('fb2-p-')) {
        const found = this.paragraphElements.find((p) => p.id === hl.locator);
        if (found) {
          targetElements = [found];
        }
      }

      for (const p of targetElements) {
        if (hl.partType && p.getAttribute('data-part-type') && p.getAttribute('data-part-type') !== hl.partType) {
          continue;
        }
        let wrapped = false;
        if (hl.startOffset !== undefined && hl.endOffset !== undefined) {
          wrapped = this.wrapRangeInElement(p, hl.startOffset, hl.endOffset, hl, palette.bg, palette.border);
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
    data: Uint8Array | ArrayBuffer | string,
    initialLocator?: string,
  ): Promise<void> {
    this.container = container;
    this.container.innerHTML = '';

    const xmlString = await this.extractXmlString(data);
    this.rawXml = xmlString;

    const parser = new DOMParser();
    this.parsedDocument = parser.parseFromString(xmlString, 'text/xml');

    const parserError = this.parsedDocument.querySelector('parsererror');
    if (parserError) {
      throw new Error(`FB2 XML Parsing Error: ${parserError.textContent || 'Unknown error'}`);
    }

    this.renderSemanticHtml();
    this.restoreHighlights();

    if (initialLocator) {
      await this.goTo(initialLocator);
    }
  }

  private async extractXmlString(data: Uint8Array | ArrayBuffer | string): Promise<string> {
    if (typeof data === 'string') {
      if (data.trim().startsWith('<?xml') || data.trim().startsWith('<FictionBook')) {
        return data;
      }
    }

    let buffer: ArrayBuffer;
    if (typeof data === 'string') {
      const encoder = new TextEncoder();
      buffer = encoder.encode(data).buffer;
    } else if (data instanceof Uint8Array) {
      buffer = data.buffer;
    } else {
      buffer = data;
    }

    const uint8 = new Uint8Array(buffer);
    const isZip = uint8.length > 4 && uint8[0] === 0x50 && uint8[1] === 0x4b && uint8[2] === 0x03 && uint8[3] === 0x04;

    if (isZip) {
      const zip = await JSZip.loadAsync(buffer);
      const fb2File = Object.values(zip.files).find((file) => file.name.toLowerCase().endsWith('.fb2'));
      if (!fb2File) {
        throw new Error('No .fb2 entry found in the provided ZIP archive');
      }
      return await fb2File.async('string');
    }

    const decoder = new TextDecoder('utf-8');
    let decoded = decoder.decode(uint8);

    const encodingMatch = decoded.slice(0, 200).match(/encoding=["']([^"']+)["']/i);
    if (encodingMatch && encodingMatch[1]) {
      const encoding = encodingMatch[1].toLowerCase();
      if (encoding !== 'utf-8' && encoding !== 'utf8') {
        try {
          const customDecoder = new TextDecoder(encoding);
          decoded = customDecoder.decode(uint8);
        } catch {
        }
      }
    }

    return decoded;
  }

  private renderSemanticHtml(): void {
    if (!this.parsedDocument || !this.container) {
      return;
    }

    const binaryMap = new Map<string, string>();
    const binaries = this.parsedDocument.querySelectorAll('binary');
    binaries.forEach((bin) => {
      const id = bin.getAttribute('id') || '';
      const contentType = bin.getAttribute('content-type') || 'image/jpeg';
      const base64Data = (bin.textContent || '').trim().replace(/\s/g, '');
      if (id && base64Data) {
        binaryMap.set(id, `data:${contentType};base64,${base64Data}`);
      }
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'fb2-document-wrapper h-full w-full overflow-y-auto px-6 py-8 select-text';
    this.scrollContainer = wrapper;

    const article = document.createElement('article');
    article.className = 'fb2-content max-w-2xl mx-auto space-y-4';
    article.style.fontSize = `${this.currentFontSize}px`;
    article.style.lineHeight = `${this.currentLineHeight}`;

    const bodies = this.parsedDocument.querySelectorAll('body');
    let paragraphCounter = 0;

    bodies.forEach((body) => {
      const sections = body.querySelectorAll('section');
      if (sections.length > 0) {
        sections.forEach((section) => {
          const sectionElem = document.createElement('section');
          sectionElem.className = 'fb2-section my-6 space-y-3';

          const title = section.querySelector('title');
          if (title) {
            const h2 = document.createElement('h2');
            h2.className = 'text-xl font-bold tracking-tight mb-4';
            h2.textContent = title.textContent || '';
            sectionElem.appendChild(h2);
          }

          const paragraphs = section.querySelectorAll('p, subtitle, empty-line');
          paragraphs.forEach((pNode) => {
            if (pNode.closest('title')) {
              return;
            }

            if (pNode.tagName.toLowerCase() === 'empty-line') {
              const spacer = document.createElement('div');
              spacer.className = 'h-4';
              sectionElem.appendChild(spacer);
              return;
            }

            const p = document.createElement('p');
            p.id = `fb2-p-${paragraphCounter}`;
            p.className = 'fb2-paragraph text-[length:inherit] leading-[inherit] cursor-text';
            p.innerHTML = this.convertInlineTags(pNode, binaryMap);
            sectionElem.appendChild(p);
            this.paragraphElements.push(p);
            paragraphCounter++;
          });

          article.appendChild(sectionElem);
        });
      } else {
        const paragraphs = body.querySelectorAll('p');
        paragraphs.forEach((pNode) => {
          if (pNode.closest('title')) {
            return;
          }

          const p = document.createElement('p');
          p.id = `fb2-p-${paragraphCounter}`;
          p.className = 'fb2-paragraph text-[length:inherit] leading-[inherit] cursor-text';
          p.innerHTML = this.convertInlineTags(pNode, binaryMap);
          article.appendChild(p);
          this.paragraphElements.push(p);
          paragraphCounter++;
        });
      }
    });

    wrapper.appendChild(article);
    this.container.appendChild(wrapper);

    this.scrollHandler = () => {
      this.updateLocationOnScroll();
    };
    wrapper.addEventListener('scroll', this.scrollHandler, { passive: true });

    this.updateLocationOnScroll();
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
    // Fallback based on paragraph density (e.g. 5 paragraphs per virtual page)
    return Math.max(1, Math.ceil(this.paragraphElements.length / 5));
  }

  private convertInlineTags(node: Element, binaryMap: Map<string, string>): string {
    let result = '';
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        result += child.textContent || '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (tag === 'strong' || tag === 'b') {
          result += `<strong>${this.convertInlineTags(el, binaryMap)}</strong>`;
        } else if (tag === 'emphasis' || tag === 'em' || tag === 'i') {
          result += `<em>${this.convertInlineTags(el, binaryMap)}</em>`;
        } else if (tag === 'image') {
          const href = el.getAttribute('l:href') || el.getAttribute('href') || '';
          const cleanHref = href.replace(/^#/, '');
          const src = binaryMap.get(cleanHref) || '';
          if (src) {
            result += `<img src="${src}" alt="" class="max-w-full my-4 rounded mx-auto" />`;
          }
        } else {
          result += this.convertInlineTags(el, binaryMap);
        }
      }
    });
    return result;
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
      currentPage = totalPages > 1
        ? Math.min(totalPages, Math.max(1, Math.round((progress / 100) * (totalPages - 1)) + 1))
        : 1;
    } else if (this.paragraphElements.length > 1) {
      progress = Number(((this.currentParagraphIndex / (this.paragraphElements.length - 1)) * 100).toFixed(2));
      currentPage = totalPages > 1
        ? Math.min(
            totalPages,
            Math.max(1, Math.round((this.currentParagraphIndex / (this.paragraphElements.length - 1)) * (totalPages - 1)) + 1),
          )
        : 1;
    }

    let chapterTitle: string | null = null;
    const currentElem = this.paragraphElements[this.currentParagraphIndex];
    if (currentElem) {
      const section = currentElem.closest('.fb2-section');
      const titleElem = section?.querySelector('h2');
      if (titleElem && titleElem.textContent) {
        chapterTitle = titleElem.textContent.trim();
      }
    }

    this.location = {
      locator: currentElem ? currentElem.id : `fb2-p-${this.currentParagraphIndex}`,
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

    // 1. Direct paragraph element by id (e.g. "fb2-p-42")
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
    if (!isNaN(numericValue) && !locator.startsWith('fb2-p-')) {
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
            Math.max(0, Math.round((numericValue / 100) * (this.paragraphElements.length - 1))),
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
              Math.round(((targetPage - 1) / Math.max(1, totalPages - 1)) * (this.paragraphElements.length - 1)),
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
    if (!this.scrollContainer) {
      return;
    }
    const current = this.scrollContainer.scrollTop;
    const pageDelta = (this.scrollContainer.clientHeight || (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 600)) * 0.9;
    this.scrollContainer.scrollTo({
      top: current + pageDelta,
      behavior: 'smooth',
    });
    setTimeout(() => this.updateLocationOnScroll(), 100);
  }

  async prev(): Promise<void> {
    if (!this.scrollContainer) {
      return;
    }
    const current = this.scrollContainer.scrollTop;
    const pageDelta = (this.scrollContainer.clientHeight || (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 600)) * 0.9;
    this.scrollContainer.scrollTo({
      top: Math.max(0, current - pageDelta),
      behavior: 'smooth',
    });
    setTimeout(() => this.updateLocationOnScroll(), 100);
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

    const paragraphs = Array.from(this.scrollContainer.querySelectorAll<HTMLElement>('p, h2, h3, div'));
    for (const p of paragraphs) {
      const pText = (p.textContent || '').toLowerCase();
      if (pText.includes(cleanTarget) || (targetWords.length > 0 && targetWords.every((w) => pText.includes(w)))) {
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
    this.parsedDocument = null;
    this.scrollContainer = null;
    super.destroy();
  }
}
