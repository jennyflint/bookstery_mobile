import JSZip from 'jszip';
import { BaseEngine } from './BaseEngine';
import type { ReaderLocation } from '../../types';

export class Fb2Engine extends BaseEngine {
  private rawXml: string = '';
  private parsedDocument: Document | null = null;
  private paragraphElements: HTMLElement[] = [];
  private currentParagraphIndex: number = 0;
  private scrollContainer: HTMLElement | null = null;
  private scrollHandler: (() => void) | null = null;

  async init(container: HTMLElement, data: Uint8Array | ArrayBuffer | string): Promise<void> {
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
            p.className = 'fb2-paragraph text-base leading-relaxed cursor-text';
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
          p.className = 'fb2-paragraph text-base leading-relaxed cursor-text';
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

    if (this.paragraphElements.length > 0) {
      this.location = {
        locator: this.paragraphElements[0].id,
        progressPercentage: 0,
      };
    }
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
    const containerHeight = this.scrollContainer.clientHeight;
    const scrollHeight = this.scrollContainer.scrollHeight;

    for (let i = 0; i < this.paragraphElements.length; i++) {
      const p = this.paragraphElements[i];
      if (p.offsetTop >= containerTop) {
        this.currentParagraphIndex = i;
        break;
      }
    }

    const maxScroll = scrollHeight - containerHeight;
    const progress = maxScroll > 0
      ? Number(((containerTop / maxScroll) * 100).toFixed(2))
      : 0;

    const currentElem = this.paragraphElements[this.currentParagraphIndex];
    this.location = {
      locator: currentElem ? currentElem.id : `fb2-p-${this.currentParagraphIndex}`,
      progressPercentage: Math.min(Math.max(progress, 0), 100),
    };
    this.onLocationChange?.(this.location);
  }

  async goTo(locator: string): Promise<void> {
    if (!this.scrollContainer) {
      return;
    }

    const target = this.paragraphElements.find((p) => p.id === locator);
    if (target) {
      this.scrollContainer.scrollTo({
        top: target.offsetTop - 16,
        behavior: 'smooth',
      });
      const index = this.paragraphElements.indexOf(target);
      if (index !== -1) {
        this.currentParagraphIndex = index;
      }
      this.updateLocationOnScroll();
    }
  }

  async next(): Promise<void> {
    if (!this.scrollContainer) {
      return;
    }
    const current = this.scrollContainer.scrollTop;
    const pageDelta = this.scrollContainer.clientHeight * 0.9;
    this.scrollContainer.scrollTo({
      top: current + pageDelta,
      behavior: 'smooth',
    });
  }

  async prev(): Promise<void> {
    if (!this.scrollContainer) {
      return;
    }
    const current = this.scrollContainer.scrollTop;
    const pageDelta = this.scrollContainer.clientHeight * 0.9;
    this.scrollContainer.scrollTo({
      top: Math.max(0, current - pageDelta),
      behavior: 'smooth',
    });
  }

  getCurrentLocation(): ReaderLocation {
    return { ...this.location };
  }

  destroy(): void {
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
