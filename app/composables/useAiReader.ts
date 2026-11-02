import { useAiStore } from '../stores/aiStore';
import { useReaderStore } from '../stores/readerStore';
import { useHighlightStore } from '../stores/highlightStore';
import type { AiPromptType, AiRequestContext, HighlightColor } from '../types';

export function useAiReader() {
  const aiStore = useAiStore();
  const readerStore = useReaderStore();
  const highlightStore = useHighlightStore();
  const { locale } = useI18n();

  const getSurroundingBookContext = (selectedText: string, radius: number = 300): string => {
    if (typeof window === 'undefined') {
      return selectedText;
    }

    try {
      const container = document.querySelector('.reader-content, .reader-viewport, #reader-container');
      if (container && container.textContent) {
        const fullContent = container.textContent;
        const index = fullContent.indexOf(selectedText);
        if (index !== -1) {
          const start = Math.max(0, index - radius);
          const end = Math.min(fullContent.length, index + selectedText.length + radius);
          return fullContent.substring(start, end).replace(/\s+/g, ' ').trim();
        }
      }
    } catch {}

    return selectedText;
  };

  const triggerAiAction = async (promptType: AiPromptType, selectedText: string) => {
    const surrounding = getSurroundingBookContext(selectedText, 300);
    const context: AiRequestContext = {
      bookId: readerStore.currentBook?.id,
      bookTitle: readerStore.currentBook?.title,
      promptType,
      selectedText,
      surroundingContext: surrounding,
      locale: locale.value,
    };

    await aiStore.openAssistant(context);
  };

  const triggerExplain = async (selectedText: string) => {
    await triggerAiAction('explain', selectedText);
  };

  const triggerCharacter = async (selectedText: string) => {
    await triggerAiAction('character', selectedText);
  };

  const triggerDictionary = async (selectedText: string) => {
    const surrounding = getSurroundingBookContext(selectedText, 300);
    await aiStore.lookupWordInDictionary({
      word: selectedText,
      contextSentence: surrounding,
      bookId: readerStore.currentBook?.id,
      bookTitle: readerStore.currentBook?.title,
    });
  };

  const triggerAskInChat = async (selectedText: string) => {
    if (!readerStore.currentBook?.id) return;
    await aiStore.openChat(readerStore.currentBook.id, selectedText);
  };

  const triggerChapterTldr = async (chapterTitle?: string, rawChapterText?: string) => {
    let content = rawChapterText || '';

    if (!content && typeof document !== 'undefined') {
      const container = document.querySelector('.reader-content, .reader-viewport, #reader-container');
      if (container && container.textContent) {
        content = container.textContent.substring(0, 4000).replace(/\s+/g, ' ').trim();
      }
    }

    const context: AiRequestContext = {
      bookId: readerStore.currentBook?.id,
      bookTitle: readerStore.currentBook?.title,
      promptType: 'tldr',
      chapterTitle: chapterTitle || readerStore.locator,
      previousChapterText: content,
      surroundingContext: content,
      locale: locale.value,
    };

    await aiStore.openAssistant(context);
  };

  const saveAiResponseAsNote = async (color: HighlightColor = 'purple'): Promise<boolean> => {
    if (!aiStore.currentOutput.trim() || !readerStore.currentBook) {
      return false;
    }

    const noteContent = `[AI ${aiStore.currentPromptType?.toUpperCase()}]: ${aiStore.currentOutput}`;
    const textToHighlight = aiStore.currentSelectionText || readerStore.currentBook.title;

    if (highlightStore.selectedHighlight) {
      await highlightStore.updateHighlightNote(highlightStore.selectedHighlight.id, noteContent);
      return true;
    }

    highlightStore.setActiveSelection({
      text: textToHighlight,
      locator: readerStore.selection?.locator || readerStore.locator || '1',
      format: readerStore.currentBook.format,
      x: readerStore.selection?.x ?? window.innerWidth / 2,
      y: readerStore.selection?.y ?? 120,
      width: readerStore.selection?.width,
      height: readerStore.selection?.height,
      blockId: readerStore.selection?.blockId,
      partType: readerStore.selection?.partType,
      startOffset: readerStore.selection?.startOffset,
      endOffset: readerStore.selection?.endOffset,
    });

    await highlightStore.createHighlight(color, noteContent);
    return true;
  };

  return {
    aiStore,
    triggerExplain,
    triggerCharacter,
    triggerDictionary,
    triggerAskInChat,
    triggerChapterTldr,
    saveAiResponseAsNote,
    getSurroundingBookContext,
  };
}
