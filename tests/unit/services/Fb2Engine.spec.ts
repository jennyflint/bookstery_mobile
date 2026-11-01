import { describe, it, expect, beforeEach } from 'vitest';
import { Fb2Engine } from '~/services/engines/Fb2Engine';

describe('Fb2Engine', () => {
  let engine: Fb2Engine;
  let container: HTMLElement;

  const sampleFb2Xml = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <book-title>Test Bookstery Book</book-title>
      <author><first-name>Taras</first-name><last-name>Shevchenko</last-name></author>
    </title-info>
  </description>
  <body>
    <section>
      <title><p>Chapter One</p></title>
      <p>This is the first paragraph with <strong>bold text</strong>.</p>
      <p>This is the second paragraph with <em>italic text</em>.</p>
    </section>
  </body>
</FictionBook>`;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    engine = new Fb2Engine();
  });

  it('should parse XML and render semantic HTML elements with deterministic paragraph IDs', async () => {
    await engine.init(container, sampleFb2Xml);

    const heading = container.querySelector('h2');
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe('Chapter One');

    const paragraphs = container.querySelectorAll('p.fb2-paragraph');
    expect(paragraphs.length).toBe(2);

    expect(paragraphs[0].id).toBe('fb2-p-0');
    expect(paragraphs[1].id).toBe('fb2-p-1');
    expect(paragraphs[0].innerHTML).toContain('<strong>bold text</strong>');
    expect(paragraphs[1].innerHTML).toContain('<em>italic text</em>');
  });

  it('should navigate to specific paragraph locator', async () => {
    await engine.init(container, sampleFb2Xml);

    await engine.goTo('fb2-p-1');
    const location = engine.getCurrentLocation();
    expect(location.locator).toBeDefined();
    expect(location.currentPage).toBeDefined();
    expect(location.totalPages).toBeGreaterThanOrEqual(1);
    expect(location.chapterTitle).toBe('Chapter One');
  });

  it('should calculate virtual pages and support numeric page navigation', async () => {
    // Generate FB2 XML with 25 paragraphs
    const manyParagraphs = Array.from({ length: 25 }, (_, i) => `<p>Paragraph content ${i}</p>`).join('\n');
    const multiPageFb2Xml = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description><title-info><book-title>Multi-page FB2</book-title></title-info></description>
  <body>
    <section>
      <title><p>Chapter One: Beginning</p></title>
      ${manyParagraphs}
    </section>
  </body>
</FictionBook>`;

    await engine.init(container, multiPageFb2Xml);

    const initialLoc = engine.getCurrentLocation();
    expect(initialLoc.totalPages).toBeGreaterThan(1);
    expect(initialLoc.currentPage).toBe(1);
    expect(initialLoc.chapterTitle).toBe('Chapter One: Beginning');

    // Navigate to page 3
    await engine.goTo('3');
    const page3Loc = engine.getCurrentLocation();
    expect(page3Loc.currentPage).toBe(3);
    expect(page3Loc.progressPercentage).toBeGreaterThan(0);

    // Percentage navigation
    await engine.goTo('100%');
    const endLoc = engine.getCurrentLocation();
    expect(endLoc.progressPercentage).toBe(100);
  });

  it('should throw an error on invalid XML structure', async () => {
    const invalidXml = '<FictionBook><unclosed>';
    await expect(engine.init(container, invalidXml)).rejects.toThrow('FB2 XML Parsing Error');
  });

  it('should cleanup DOM on destroy', async () => {
    await engine.init(container, sampleFb2Xml);
    engine.destroy();
    expect(container.innerHTML).toBe('');
  });
});
