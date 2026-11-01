<script setup lang="ts">
import { ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { isNativeReaderBridgeAvailable } from '../../services/NativeReaderBridge';
import { useDeviceScanner } from '../../composables/useDeviceScanner';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'imported'): void;
}>();

const { t } = useI18n();
const {
  isScanning,
  scanProgress,
  scannedFiles,
  duplicateNotice,
  scanDevice,
  importFiles,
  importFromBlob,
  importNativeFiles,
  clearDuplicateNotice,
} = useDeviceScanner();

const selectedFiles = ref<Set<string>>(new Set());
const fileInputRef = ref<HTMLInputElement | null>(null);
const duplicateMessage = ref<string | null>(null);

const dismissDuplicateNotice = () => {
  duplicateMessage.value = null;
  clearDuplicateNotice();
};

const handleScan = async () => {
  dismissDuplicateNotice();
  const files = await scanDevice();
  selectedFiles.value = new Set(files.filter((f) => !f.isDuplicate).map((f) => f.path));
};

const toggleFileSelection = (path: string) => {
  if (selectedFiles.value.has(path)) {
    selectedFiles.value.delete(path);
  } else {
    selectedFiles.value.add(path);
  }
};

const handleImportSelected = async () => {
  dismissDuplicateNotice();
  const toImport = scannedFiles.value.filter((f) => selectedFiles.value.has(f.path) && !f.isDuplicate);
  if (toImport.length > 0) {
    const result = await importFiles(toImport);
    if (result.importedCount > 0) {
      emit('imported');
      emit('close');
    } else if (result.duplicateCount > 0) {
      duplicateMessage.value = t('scanner.noNewFilesToImport');
    }
  }
};

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const handleImportClick = async () => {
  dismissDuplicateNotice();
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await FilePicker.pickFiles({
        types: [
          'application/pdf',
          'application/epub+zip',
          'application/x-fictionbook+xml',
          'application/zip',
          'application/octet-stream',
          '*/*',
        ],
        limit: 0,
        // File content is copied natively; reading it here would push the whole file through the bridge as Base64.
        readData: !isNativeReaderBridgeAvailable(),
      });

      if (result && result.files && result.files.length > 0) {
        const importRes = await importNativeFiles(result.files);
        if (importRes.importedCount > 0) {
          emit('imported');
          if (importRes.duplicates.length === 0) {
            emit('close');
          } else {
            duplicateMessage.value = t('scanner.duplicateDetected', {
              title: importRes.duplicates.join(', '),
            });
          }
        } else if (importRes.duplicates.length > 0) {
          duplicateMessage.value = t('scanner.duplicateDetected', {
            title: importRes.duplicates.join(', '),
          });
        } else if (importRes.failed.length > 0) {
          duplicateMessage.value = t('scanner.importFailed', { title: importRes.failed.join(', ') });
        }
        return;
      }
    } catch (pickerErr: unknown) {
      const err = pickerErr as { message?: string; name?: string };
      const msg = (err?.message || '').toLowerCase();
      if (
        msg.includes('cancel') ||
        msg.includes('abort') ||
        msg.includes('dismiss') ||
        err?.name === 'AbortError'
      ) {
        return;
      }
      triggerFileInput();
      return;
    }
  }

  triggerFileInput();
};

const handleFileChosen = async (event: Event) => {
  dismissDuplicateNotice();
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    let importedAny = false;
    const duplicates: string[] = [];

    for (let i = 0; i < target.files.length; i++) {
      const file = target.files[i];
      const result = await importFromBlob(file);
      if (result.success) {
        importedAny = true;
      } else if (result.isDuplicate) {
        const title = result.book?.title || file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
        duplicates.push(title);
      }
    }

    target.value = '';

    if (importedAny) {
      emit('imported');
      if (duplicates.length === 0) {
        emit('close');
      } else {
        duplicateMessage.value = t('scanner.duplicateDetected', { title: duplicates.join(', ') });
      }
    } else if (duplicates.length > 0) {
      duplicateMessage.value = t('scanner.duplicateDetected', { title: duplicates.join(', ') });
    }
  }
};
</script>

<template>
  <div
    v-if="isOpen"
    data-testid="device-scanner-modal"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
  >
    <div class="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh] border border-zinc-100">
      <div class="flex items-center justify-between pb-4 border-b border-zinc-100">
        <div>
          <h2 class="text-xl font-bold text-zinc-900">{{ t('scanner.title') }}</h2>
          <p class="text-xs text-zinc-500 mt-0.5">{{ t('scanner.description') }}</p>
        </div>
        <button
          type="button"
          class="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          @click="emit('close')"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto py-4 space-y-4">
        <!-- Duplicate Warning Banner -->
        <div
          v-if="duplicateMessage || duplicateNotice"
          class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start justify-between gap-2"
        >
          <div class="flex items-start gap-2">
            <svg class="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{{ duplicateMessage || (duplicateNotice ? t('scanner.duplicateDetected', { title: duplicateNotice }) : '') }}</span>
          </div>
          <button
            type="button"
            class="text-amber-500 hover:text-amber-700"
            @click="dismissDuplicateNotice"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="flex items-center gap-3">
          <button
            type="button"
            :disabled="isScanning"
            class="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold text-sm transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
            @click="handleScan"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>{{ isScanning ? t('scanner.scanning') : t('scanner.startScan') }}</span>
          </button>

          <button
            type="button"
            class="py-3 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold text-sm transition-all flex items-center gap-2"
            @click="handleImportClick"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>{{ t('library.importBook') }}</span>
          </button>
          <input
            ref="fileInputRef"
            type="file"
            accept=".pdf,.epub,.fb2,.zip"
            multiple
            class="hidden"
            @change="handleFileChosen"
          />
        </div>

        <div v-if="isScanning" class="space-y-2 py-4">
          <div class="w-full bg-zinc-100 rounded-full h-2 overflow-hidden">
            <div
              class="bg-indigo-600 h-2 transition-all duration-200"
              :style="{ width: `${scanProgress || 50}%` }"
            />
          </div>
          <p class="text-xs text-center font-medium text-zinc-500">{{ t('scanner.importing') }}</p>
        </div>

        <div v-if="scannedFiles.length > 0" class="space-y-2">
          <p class="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            {{ t('scanner.foundBooks', { count: scannedFiles.length }) }}
          </p>
          <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
            <label
              v-for="file in scannedFiles"
              :key="file.path"
              class="flex items-center gap-3 p-3 rounded-xl border transition-colors"
              :class="file.isDuplicate ? 'bg-zinc-50 border-zinc-200 opacity-60 cursor-not-allowed' : 'border-zinc-200 hover:bg-zinc-50 cursor-pointer'"
            >
              <input
                type="checkbox"
                :checked="selectedFiles.has(file.path)"
                :disabled="file.isDuplicate"
                class="w-4 h-4 rounded text-indigo-600 border-zinc-300 focus:ring-indigo-500 disabled:opacity-40"
                @change="toggleFileSelection(file.path)"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-semibold text-zinc-900 truncate">{{ file.name }}</p>
                  <span
                    v-if="file.isDuplicate"
                    class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-100 text-amber-800 shrink-0"
                  >
                    {{ t('scanner.alreadyInLibrary') }}
                  </span>
                </div>
                <p class="text-xs text-zinc-400 uppercase font-mono">{{ file.format }}</p>
              </div>
            </label>
          </div>
        </div>

        <div v-else-if="!isScanning" class="py-8 text-center text-zinc-400 text-sm">
          {{ t('scanner.noFilesFound') }}
        </div>
      </div>

      <div class="pt-4 border-t border-zinc-100 flex justify-end gap-3">
        <button
          type="button"
          class="px-4 py-2.5 rounded-xl text-zinc-600 hover:bg-zinc-100 font-medium text-sm transition-colors"
          @click="emit('close')"
        >
          {{ t('dictionary.delete') === 'Remove' ? 'Cancel' : 'Скасувати' }}
        </button>
        <button
          v-if="scannedFiles.length > 0"
          type="button"
          :disabled="selectedFiles.size === 0 || isScanning"
          class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold text-sm transition-all disabled:opacity-50"
          @click="handleImportSelected"
        >
          {{ t('scanner.importSelected', { count: selectedFiles.size }) }}
        </button>
      </div>
    </div>
  </div>
</template>
