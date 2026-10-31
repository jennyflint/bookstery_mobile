<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useHighlightStore } from '../../stores/highlightStore';
import { QuoteCardGeneratorService } from '../../services/export/QuoteCardGeneratorService';
import type { QuoteCardAspectRatio, QuoteCardTheme } from '../../types';

const { t } = useI18n();
const highlightStore = useHighlightStore();
const generatorService = QuoteCardGeneratorService.getInstance();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const currentTheme = ref<QuoteCardTheme>('sepia');
const currentAspectRatio = ref<QuoteCardAspectRatio>('portrait');
const isGenerating = ref(false);
const actionMessage = ref<string | null>(null);

const themes: QuoteCardTheme[] = ['sepia', 'green', 'oled', 'white'];

const renderPreview = async () => {
  if (!highlightStore.quoteCardOptions || !canvasRef.value) return;
  isGenerating.value = true;

  try {
    const rendered = await generatorService.generateCanvas({
      theme: currentTheme.value,
      aspectRatio: currentAspectRatio.value,
      quoteText: highlightStore.quoteCardOptions.quoteText,
      bookTitle: highlightStore.quoteCardOptions.bookTitle,
      author: highlightStore.quoteCardOptions.author,
      highlightColor: highlightStore.quoteCardOptions.highlightColor,
    });

    const targetCanvas = canvasRef.value;
    targetCanvas.width = rendered.width;
    targetCanvas.height = rendered.height;
    const ctx = targetCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(rendered, 0, 0);
    }
  } catch (err) {
    console.error('Failed to render quote card preview:', err);
  } finally {
    isGenerating.value = false;
  }
};

watch(
  () => [highlightStore.isQuoteCardModalOpen, currentTheme.value, currentAspectRatio.value],
  ([isOpen]) => {
    if (isOpen) {
      if (highlightStore.quoteCardOptions?.theme) {
        currentTheme.value = highlightStore.quoteCardOptions.theme;
      }
      setTimeout(renderPreview, 50);
    }
  },
);

onMounted(() => {
  if (highlightStore.isQuoteCardModalOpen) {
    renderPreview();
  }
});

const handleSaveToGallery = async () => {
  if (!highlightStore.quoteCardOptions) return;
  isGenerating.value = true;
  actionMessage.value = null;

  try {
    await generatorService.saveToDevice({
      theme: currentTheme.value,
      aspectRatio: currentAspectRatio.value,
      quoteText: highlightStore.quoteCardOptions.quoteText,
      bookTitle: highlightStore.quoteCardOptions.bookTitle,
      author: highlightStore.quoteCardOptions.author,
      highlightColor: highlightStore.quoteCardOptions.highlightColor,
    });
    actionMessage.value = t('quoteCard.savedSuccess');
    setTimeout(() => {
      actionMessage.value = null;
    }, 2500);
  } catch (err) {
    console.error('Failed to save quote card to gallery:', err);
  } finally {
    isGenerating.value = false;
  }
};

const handleShareImage = async () => {
  if (!highlightStore.quoteCardOptions) return;
  isGenerating.value = true;

  try {
    await generatorService.shareQuoteCard({
      theme: currentTheme.value,
      aspectRatio: currentAspectRatio.value,
      quoteText: highlightStore.quoteCardOptions.quoteText,
      bookTitle: highlightStore.quoteCardOptions.bookTitle,
      author: highlightStore.quoteCardOptions.author,
      highlightColor: highlightStore.quoteCardOptions.highlightColor,
    });
  } catch (err) {
    console.error('Failed to share quote card:', err);
  } finally {
    isGenerating.value = false;
  }
};

const handleClose = () => {
  highlightStore.closeQuoteCardModal();
};
</script>

<template>
  <div
    v-if="highlightStore.isQuoteCardModalOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
    data-testid="quote-card-modal"
    @click.self="handleClose"
  >
    <div
      class="w-full max-w-md max-h-[92vh] bg-zinc-950 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-4 shadow-2xl text-white overflow-y-auto animate-in zoom-in-95 duration-200"
    >
      <header class="flex items-center justify-between">
        <h3 class="text-base font-bold text-zinc-100 flex items-center gap-2">
          <svg class="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {{ t('quoteCard.title') }}
        </h3>
        <button
          type="button"
          data-testid="close-quote-card-btn"
          class="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          @click="handleClose"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="relative w-full flex justify-center items-center bg-zinc-900/80 rounded-2xl p-2.5 overflow-hidden shadow-inner border border-zinc-800/80">
        <canvas
          ref="canvasRef"
          class="max-h-[380px] w-auto max-w-full rounded-xl shadow-lg object-contain transition-all duration-200"
        />
        <div
          v-if="isGenerating"
          class="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center text-xs font-semibold text-emerald-400 gap-2"
        >
          <div class="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          {{ t('quoteCard.generating') }}
        </div>
      </div>

      <div
        v-if="actionMessage"
        class="py-2 px-3 bg-emerald-950/80 border border-emerald-800 rounded-xl text-center text-xs font-semibold text-emerald-300 animate-in fade-in"
      >
        {{ actionMessage }}
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-xs font-bold text-zinc-400">
          {{ t('quoteCard.theme') }}
        </label>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="th in themes"
            :key="th"
            type="button"
            :data-testid="`theme-btn-${th}`"
            class="py-2 px-2 rounded-xl text-xs font-bold text-center border transition-all active:scale-95"
            :class="currentTheme === th ? 'border-emerald-400 ring-2 ring-emerald-500/30 bg-zinc-800 text-white' : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'"
            @click="currentTheme = th"
          >
            {{ t(`quoteCard.themes.${th}`) }}
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-xs font-bold text-zinc-400">
          {{ t('quoteCard.aspectRatio') }}
        </label>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="ratio-portrait-btn"
            class="py-2 px-3 rounded-xl text-xs font-bold text-center border transition-all active:scale-95 flex items-center justify-center gap-1.5"
            :class="currentAspectRatio === 'portrait' ? 'border-emerald-400 ring-2 ring-emerald-500/30 bg-zinc-800 text-white' : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'"
            @click="currentAspectRatio = 'portrait'"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <rect x="5" y="3" width="14" height="18" rx="2" stroke-width="2" />
            </svg>
            {{ t('quoteCard.portrait') }}
          </button>
          <button
            type="button"
            data-testid="ratio-square-btn"
            class="py-2 px-3 rounded-xl text-xs font-bold text-center border transition-all active:scale-95 flex items-center justify-center gap-1.5"
            :class="currentAspectRatio === 'square' ? 'border-emerald-400 ring-2 ring-emerald-500/30 bg-zinc-800 text-white' : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'"
            @click="currentAspectRatio = 'square'"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" stroke-width="2" />
            </svg>
            {{ t('quoteCard.square') }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2.5 pt-2">
        <button
          type="button"
          data-testid="save-quote-card-btn"
          class="py-3 px-4 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 active:scale-95 transition-all flex items-center justify-center gap-2 border border-zinc-700"
          :disabled="isGenerating"
          @click="handleSaveToGallery"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {{ t('quoteCard.saveToGallery') }}
        </button>

        <button
          type="button"
          data-testid="share-quote-card-btn"
          class="py-3 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 shadow-lg transition-all flex items-center justify-center gap-2"
          :disabled="isGenerating"
          @click="handleShareImage"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          {{ t('quoteCard.shareImage') }}
        </button>
      </div>
    </div>
  </div>
</template>
