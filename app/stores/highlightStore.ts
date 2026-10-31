import { defineStore } from 'pinia';
import { HighlightRepository } from '../services/database/HighlightRepository';
import type {
  ActiveHighlightSelection,
  BookFormat,
  HighlightColor,
  HighlightRecord,
  QuoteCardOptions,
} from '../types';

export const useHighlightStore = defineStore('highlight', {
  state: () => ({
    highlights: [] as HighlightRecord[],
    currentBookId: '' as string,
    currentBookTitle: '' as string,
    currentBookAuthor: '' as string,
    currentBookFormat: 'epub' as BookFormat,
    selectedHighlight: null as HighlightRecord | null,
    activeSelection: null as ActiveHighlightSelection | null,
    isNoteModalOpen: false,
    isQuoteCardModalOpen: false,
    isNotesDrawerOpen: false,
    isExportModalOpen: false,
    quoteCardOptions: null as QuoteCardOptions | null,
    draftQuoteText: '',
    draftNoteText: '',
    draftHighlightId: null as string | null,
    draftColor: 'green' as HighlightColor,
    draftLocator: '',
    draftFormat: 'epub' as BookFormat,
    searchQuery: '',
    activeColorFilter: null as HighlightColor | null,
  }),

  getters: {
    filteredHighlights: (state): HighlightRecord[] => {
      let list = state.highlights;
      if (state.activeColorFilter) {
        list = list.filter((hl) => hl.color === state.activeColorFilter);
      }
      if (state.searchQuery.trim()) {
        const query = state.searchQuery.trim().toLowerCase();
        list = list.filter(
          (hl) =>
            hl.selected_text.toLowerCase().includes(query) ||
            (hl.note && hl.note.toLowerCase().includes(query)),
        );
      }
      return list;
    },
    totalHighlightsCount: (state): number => state.highlights.length,
  },

  actions: {
    setBookContext(bookId: string, title: string, author?: string | null, format?: BookFormat): void {
      this.currentBookId = bookId;
      this.currentBookTitle = title;
      this.currentBookAuthor = author || '';
      this.currentBookFormat = format || 'epub';
    },

    setActiveSelection(selection: ActiveHighlightSelection | null): void {
      this.activeSelection = selection;
    },

    async loadHighlights(bookId: string): Promise<void> {
      this.currentBookId = bookId;
      const repository = HighlightRepository.getInstance();
      this.highlights = await repository.getHighlightsByBook(bookId);
    },

    async createHighlight(color: HighlightColor, noteText?: string | null): Promise<HighlightRecord | null> {
      if (!this.activeSelection || !this.currentBookId) {
        return null;
      }

      const repository = HighlightRepository.getInstance();
      const newHighlight = await repository.createHighlight({
        book_id: this.currentBookId,
        format: this.activeSelection.format,
        locator: this.activeSelection.locator,
        selected_text: this.activeSelection.text,
        color,
        note: noteText || null,
      });

      this.highlights.unshift(newHighlight);
      this.activeSelection = null;
      return newHighlight;
    },

    openNoteEditorForSelection(color: HighlightColor = 'green'): void {
      if (!this.activeSelection) return;
      this.draftHighlightId = null;
      this.draftQuoteText = this.activeSelection.text;
      this.draftNoteText = '';
      this.draftColor = color;
      this.draftLocator = this.activeSelection.locator;
      this.draftFormat = this.activeSelection.format;
      this.isNoteModalOpen = true;
    },

    openNoteEditorForExisting(highlight: HighlightRecord): void {
      this.draftHighlightId = highlight.id;
      this.draftQuoteText = highlight.selected_text;
      this.draftNoteText = highlight.note || '';
      this.draftColor = highlight.color;
      this.draftLocator = highlight.locator;
      this.draftFormat = highlight.format;
      this.selectedHighlight = highlight;
      this.isNoteModalOpen = true;
    },

    async saveDraftNote(noteContent: string): Promise<HighlightRecord | null> {
      const repository = HighlightRepository.getInstance();

      if (this.draftHighlightId) {
        const updated = await repository.updateNote(this.draftHighlightId, noteContent || null);
        const index = this.highlights.findIndex((h) => h.id === this.draftHighlightId);
        if (index !== -1) {
          this.highlights[index] = updated;
        }
        this.closeNoteModal();
        return updated;
      }

      if (this.draftQuoteText && this.currentBookId) {
        const created = await repository.createHighlight({
          book_id: this.currentBookId,
          format: this.draftFormat,
          locator: this.draftLocator,
          selected_text: this.draftQuoteText,
          color: this.draftColor,
          note: noteContent || null,
        });
        this.highlights.unshift(created);
        this.activeSelection = null;
        this.closeNoteModal();
        return created;
      }

      this.closeNoteModal();
      return null;
    },

    async updateHighlightColor(id: string, color: HighlightColor): Promise<void> {
      const repository = HighlightRepository.getInstance();
      const updated = await repository.updateColor(id, color);
      const index = this.highlights.findIndex((h) => h.id === id);
      if (index !== -1) {
        this.highlights[index] = updated;
      }
      if (this.selectedHighlight?.id === id) {
        this.selectedHighlight = updated;
      }
    },

    async deleteHighlight(id: string): Promise<void> {
      const repository = HighlightRepository.getInstance();
      await repository.deleteHighlight(id);
      this.highlights = this.highlights.filter((h) => h.id !== id);
      if (this.selectedHighlight?.id === id) {
        this.selectedHighlight = null;
      }
      if (this.draftHighlightId === id) {
        this.closeNoteModal();
      }
    },

    openQuoteCardForSelection(): void {
      if (!this.activeSelection) return;
      this.quoteCardOptions = {
        theme: 'sepia',
        quoteText: this.activeSelection.text,
        bookTitle: this.currentBookTitle || 'Bookstery',
        author: this.currentBookAuthor || null,
        aspectRatio: 'portrait',
      };
      this.activeSelection = null;
      this.isQuoteCardModalOpen = true;
    },

    openQuoteCardForHighlight(highlight: HighlightRecord): void {
      this.quoteCardOptions = {
        theme: 'sepia',
        quoteText: highlight.selected_text,
        bookTitle: this.currentBookTitle || 'Bookstery',
        author: this.currentBookAuthor || null,
        aspectRatio: 'portrait',
        highlightColor: highlight.color,
      };
      this.isQuoteCardModalOpen = true;
    },

    closeNoteModal(): void {
      this.isNoteModalOpen = false;
      this.draftHighlightId = null;
      this.draftQuoteText = '';
      this.draftNoteText = '';
    },

    closeQuoteCardModal(): void {
      this.isQuoteCardModalOpen = false;
      this.quoteCardOptions = null;
    },

    toggleNotesDrawer(): void {
      this.isNotesDrawerOpen = !this.isNotesDrawerOpen;
    },

    openNotesDrawer(): void {
      this.isNotesDrawerOpen = true;
    },

    closeNotesDrawer(): void {
      this.isNotesDrawerOpen = false;
    },

    openExportModal(): void {
      this.isExportModalOpen = true;
    },

    closeExportModal(): void {
      this.isExportModalOpen = false;
    },

    setSearchQuery(query: string): void {
      this.searchQuery = query;
    },

    setColorFilter(color: HighlightColor | null): void {
      this.activeColorFilter = color;
    },
  },
});
