---
name: book-format-engine
description: >-
  Implements book format parsers (PDF, EPUB, FB2), metadata extractors, TOC builders, and unified reader adapters in Bookstery Mobile.
---

# Book Format Engine Agent Skill

Use this skill when developing or maintaining e-book file parsing, text layer extraction, pagination, table of contents (TOC), and rendering pipelines.

## Supported Formats & Architecture

All format-specific parsers must reside in `app/services/engine/` and follow the Strategy/Adapter pattern.

1. **Contracts (`app/types/format.ts`)**:
   - Every format parser must implement unified interfaces:
     - `IBookParser`: `parse(file: Blob | ArrayBuffer): Promise<IBookDocument>`
     - `IBookMetadata`: title, authors, description, coverImage, language, identifier.
     - `IBookChapter`: id, title, href, subitems.
     - `IBookDocument`: metadata, chapters, reader viewport adapter.

2. **Specialized Format Services**:
   - `app/services/engine/pdf.service.ts`:
     - PDF rendering (via PDF.js or native canvas), text layer extraction, viewport scaling, page thumbnail generation.
   - `app/services/engine/epub.service.ts`:
     - EPUB zip archive unpacking, OPF metadata & manifest parsing, NCX / Navigation Document TOC extraction, CFI (Canonical Fragment Identifier) navigation.
   - `app/services/engine/fb2.service.ts`:
     - FB2 XML/DOM parsing, Base64 binary cover extraction, fiction-book description mapping, section-by-section pagination.

3. **Unified Engine Adapter (`app/services/engine/index.ts`)**:
   - Provide a factory function or unified adapter `createBookParser(fileType: BookFormatType): IBookParser`.
   - UI reader components (`app/components/reader/`) must ONLY interact with this unified adapter, never with format-specific libraries directly.

4. **Error Handling & Performance**:
   - File parsing must be asynchronous, memory-efficient, and safe on mobile devices (chunked reads / web workers if large).
   - All errors must be normalized into typed domain errors (e.g., `CorruptedBookError`, `UnsupportedFormatError`).
   - All comments must be in English.
