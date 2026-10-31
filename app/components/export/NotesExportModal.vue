<script setup lang="ts">
import { ref } from 'vue';
import { useHighlightStore } from '../../stores/highlightStore';
import { NotesExportService } from '../../services/export/NotesExportService';
import type { ExportFormat } from '../../types';

const { t } = useI18n();
const highlightStore = useHighlightStore();
const exportService = NotesExportService.getInstance();

const selectedFormat = ref<ExportFormat>('md');
const isExporting = ref(false);
const statusMessage = ref<string | null>(null);

const formats: ExportFormat[] = ['md', 'html', 'txt', 'json'];

const handleShareExport = async () => {
  if (!highlightStore.currentBookId) return;
  isExporting.value = true;
  statusMessage.value = null;

  try {
    await exportService.shareExportedNotes(highlightStore.currentBookId, selectedFormat.value);
    statusMessage.value = t('export.exportedSuccess');
    setTimeout(() => {
      statusMessage.value = null;
    }, 2500);
  } catch (err) {
    console.error('Failed to share exported notes:', err);
  } finally {
    isExporting.value = false;
  }
};

const handleDownloadExport = async () => {
  if (!highlightStore.currentBookId) return;
  isExporting.value = true;
  statusMessage.value = null;

  try {
    const { fileName, content } = await exportService.saveExportFileToCache(
      highlightStore.currentBookId,
      selectedFormat.value,
    );
    exportService.triggerBrowserDownload(fileName, content, selectedFormat.value);
    statusMessage.value = t('export.exportedSuccess');
    setTimeout(() => {
      statusMessage.value = null;
    }, 2500);
  } catch (err) {
    console.error('Failed to download exported notes:', err);
  } finally {
    isExporting.value = false;
  }
};

const handleClose = () => {
  highlightStore.closeExportModal();
};
</script>

<template>
  <div
    v-if="highlightStore.isExportModalOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    data-testid="notes-export-modal"
    @click.self="handleClose"
  >
    <div
      class="w-full max-w-md bg-white rounded-3xl p-6 flex flex-col gap-5 shadow-2xl animate-in zoom-in-95 duration-200 border border-zinc-200"
    >
      <header class="flex items-center justify-between">
        <h3 class="text-base font-bold text-zinc-900 flex items-center gap-2">
          <svg class="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {{ t('export.title') }}
        </h3>
        <button
          type="button"
          data-testid="close-export-btn"
          class="p-1 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          @click="handleClose"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-100 text-xs text-zinc-600 flex items-center justify-between">
        <div class="truncate max-w-[240px]">
          <span class="font-bold text-zinc-800 block truncate">{{ highlightStore.currentBookTitle || 'Bookstery' }}</span>
          <span class="text-zinc-400">{{ highlightStore.totalHighlightsCount }} {{ t('highlights.notesTitle') }}</span>
        </div>
        <span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
          {{ highlightStore.currentBookFormat.toUpperCase() }}
        </span>
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-xs font-bold text-zinc-500 uppercase tracking-wider">
          {{ t('export.format') }}
        </label>
        <div class="grid grid-cols-1 gap-2">
          <button
            v-for="fmt in formats"
            :key="fmt"
            type="button"
            :data-testid="`export-format-${fmt}`"
            class="flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left active:scale-[0.99]"
            :class="selectedFormat === fmt ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20 text-emerald-950 font-bold' : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 font-medium'"
            @click="selectedFormat = fmt"
          >
            <span class="text-xs">{{ t(`export.formats.${fmt}`) }}</span>
            <div
              class="w-4 h-4 rounded-full border flex items-center justify-center"
              :class="selectedFormat === fmt ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-300'"
            >
              <div v-if="selectedFormat === fmt" class="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
          </button>
        </div>
      </div>

      <div
        v-if="statusMessage"
        class="py-2.5 px-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center text-xs font-semibold text-emerald-700 animate-in fade-in"
      >
        {{ statusMessage }}
      </div>

      <div class="grid grid-cols-2 gap-3 pt-2">
        <button
          type="button"
          data-testid="download-export-btn"
          class="py-3 px-4 rounded-xl text-xs font-bold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 active:scale-95 transition-all flex items-center justify-center gap-1.5"
          :disabled="isExporting"
          @click="handleDownloadExport"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {{ t('export.download') }}
        </button>

        <button
          type="button"
          data-testid="confirm-export-btn"
          class="py-3 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 shadow-md transition-all flex items-center justify-center gap-1.5"
          :disabled="isExporting"
          @click="handleShareExport"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          {{ t('export.exportAndShare') }}
        </button>
      </div>
    </div>
  </div>
</template>
