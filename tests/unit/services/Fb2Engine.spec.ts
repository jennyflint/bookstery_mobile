import { describe, it, expect, beforeEach } from 'vitest';
import { Fb2Engine } from '../../../services/engines/Fb2Engine';

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
