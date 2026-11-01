<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useScannerStore } from '../../stores/scannerStore';
import {
  AutoScanService,
  deriveDisplayNameFromUri,
} from '../../services/scanner/AutoScanService';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import type { ScanDirectory } from '../../types';

const { t } = useI18n();
const scannerStore = useScannerStore();

const folderToDelete = ref<ScanDirectory | null>(null);
const errorMessage = ref<string | null>(null);
const isPickingFolder = ref(false);

onMounted(async () => {
  await scannerStore.init();
});

const handleToggleAutoScan = async () => {
  const nextValue = scannerStore.settings.auto_scan_on_startup === 1 ? 0 : 1;
  await scannerStore.updateSettings({ auto_scan_on_startup: nextValue });
};

const handleToggleRecursive = async () => {
  const nextValue = scannerStore.settings.scan_subdirectories === 1 ? 0 : 1;
  await scannerStore.updateSettings({ scan_subdirectories: nextValue });
};

const handleToggleDir = async (dir: ScanDirectory) => {
  const nextActive = dir.is_active === 0;
  await scannerStore.toggleFolder(dir.id, nextActive);
};

const confirmDelete = (dir: ScanDirectory) => {
  folderToDelete.value = dir;
};

const cancelDelete = () => {
  folderToDelete.value = null;
};

const executeDelete = async () => {
  if (folderToDelete.value) {
    await scannerStore.removeFolder(folderToDelete.value.id);
    folderToDelete.value = null;
  }
};

const handleScanNow = async () => {
  errorMessage.value = null;
  await scannerStore.runManualScan();
};

const handleAddFolder = async () => {
  errorMessage.value = null;
  isPickingFolder.value = true;

  try {
    let selectedPath = '';
    let displayName = '';

    try {
      const result = await FilePicker.pickDirectory();
      if (result && result.path) {
        selectedPath = result.path;
        displayName = deriveDisplayNameFromUri(selectedPath);
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

      if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
        try {
          const picker = (
            window as unknown as { showDirectoryPicker: () => Promise<{ name: string }> }
          ).showDirectoryPicker;
          const handle = await picker();
          if (handle && handle.name) {
            selectedPath = handle.name;
            displayName = handle.name;
          }
        } catch (webErr: unknown) {
          const err2 = webErr as { message?: string; name?: string };
          const msg2 = (err2?.message || '').toLowerCase();
          if (
            msg2.includes('cancel') ||
            msg2.includes('abort') ||
            msg2.includes('dismiss') ||
            err2?.name === 'AbortError'
          ) {
            return;
          }
          throw webErr;
        }
      } else {
        throw pickerErr;
      }
    }

    if (!selectedPath) {
      return;
    }

    const alreadyExists = scannerStore.directories.some(
      (d) => d.uri.toLowerCase() === selectedPath.toLowerCase(),
    );
    if (alreadyExists) {
      errorMessage.value = t('scanner.folderExistsError');
      return;
    }

    const scanner = AutoScanService.getInstance();
    const isAccessible = await scanner.validateDirectoryAccess(selectedPath);
    if (!isAccessible) {
      errorMessage.value = t('scanner.folderAccessError');
      return;
    }

    await scannerStore.addFolder(selectedPath, displayName);
  } catch (err: unknown) {
    const errorObj = err as { message?: string; name?: string };
    const msg = (errorObj?.message || '').toLowerCase();
    if (
      msg.includes('cancel') ||
      msg.includes('abort') ||
      msg.includes('dismiss') ||
      errorObj?.name === 'AbortError'
    ) {
      return;
    }
    errorMessage.value = t('scanner.folderAccessError');
  } finally {
    isPickingFolder.value = false;
  }
};

const formatRelativeTime = (timestamp: number | null): string => {
  if (!timestamp) {
    return t('scanner.neverScanned');
  }
  const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSeconds < 60) {
    return t('scanner.lastScannedJustNow');
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return t('scanner.lastScannedMinutesAgo', { count: diffMinutes });
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return t('scanner.lastScannedHoursAgo', { count: diffHours });
  }
  const diffDays = Math.floor(diffHours / 24);
  return t('scanner.lastScannedDaysAgo', { count: diffDays });
};
</script>

<template>
  <div class="space-y-6">
    <div
      class="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div class="mb-5 flex items-center justify-between">
        <div>
          <h3 class="text-base font-bold text-zinc-900 dark:text-zinc-100">
            {{ t('scanner.autoScanSettings') }}
          </h3>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            {{ t('scanner.description') }}
          </p>
        </div>
      </div>

      <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <div class="flex items-center justify-between py-3">
          <span class="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {{ t('scanner.autoScanOnStartup') }}
          </span>
          <button
            type="button"
            data-testid="toggle-auto-scan"
            class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
            :class="
              scannerStore.settings.auto_scan_on_startup === 1
                ? 'bg-[#3E5725] dark:bg-[#C8E695]'
                : 'bg-zinc-300 dark:bg-zinc-700'
            "
            @click="handleToggleAutoScan"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out dark:bg-zinc-900"
              :class="
                scannerStore.settings.auto_scan_on_startup === 1
                  ? 'translate-x-5'
                  : 'translate-x-0'
              "
            />
          </button>
        </div>

        <div class="flex items-center justify-between py-3">
          <span class="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {{ t('scanner.scanSubdirectories') }}
          </span>
          <button
            type="button"
            data-testid="toggle-recursive-scan"
            class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
            :class="
              scannerStore.settings.scan_subdirectories === 1
                ? 'bg-[#3E5725] dark:bg-[#C8E695]'
                : 'bg-zinc-300 dark:bg-zinc-700'
            "
            @click="handleToggleRecursive"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out dark:bg-zinc-900"
              :class="
                scannerStore.settings.scan_subdirectories === 1
                  ? 'translate-x-5'
                  : 'translate-x-0'
              "
            />
          </button>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3 pt-3">
        <button
          type="button"
          data-testid="add-folder-btn"
          :disabled="isPickingFolder"
          class="inline-flex items-center gap-2 rounded-2xl bg-[#C8E695] px-4 py-2.5 text-xs font-bold text-[#3E5725] transition hover:bg-[#C8E695]/80 disabled:opacity-50 active:scale-95"
          @click="handleAddFolder"
        >
          <svg
            v-if="isPickingFolder"
            class="h-4 w-4 animate-spin text-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <svg v-else class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          {{ t('scanner.addFolder') }}
        </button>

        <button
          type="button"
          data-testid="manual-scan-btn"
          :disabled="scannerStore.isScanning || !scannerStore.hasActiveDirectories"
          class="inline-flex items-center gap-2 rounded-2xl bg-[#3E5725] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#3E5725]/90 disabled:opacity-50 active:scale-95 dark:bg-[#C8E695] dark:text-[#3E5725]"
          @click="handleScanNow"
        >
          <svg
            v-if="scannerStore.isScanning"
            class="h-4 w-4 animate-spin text-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <svg v-else class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span v-if="scannerStore.isScanning">
            {{
              t('scanner.scanningLive', {
                count: scannerStore.currentCheckedCount,
              })
            }}
          </span>
          <span v-else>
            {{ t('scanner.scanNow') }}
          </span>
        </button>
      </div>

      <div
        v-if="errorMessage"
        class="mt-4 rounded-2xl bg-red-50 p-3 text-xs font-medium text-red-600 dark:bg-red-950/30 dark:text-red-400"
      >
        {{ errorMessage }}
      </div>
    </div>

    <div
      class="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h4 class="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {{ t('scanner.configuredDirectories') }} ({{ scannerStore.directories.length }})
      </h4>

      <div
        v-if="scannerStore.directories.length === 0"
        class="rounded-2xl border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-400 dark:border-zinc-800"
      >
        {{ t('scanner.noDirectoriesConfigured') }}
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="dir in scannerStore.directories"
          :key="dir.id"
          class="flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/40"
        >
          <div class="flex items-center gap-3 overflow-hidden pr-2">
            <div
              class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#C8E695]/30 text-[#3E5725] dark:bg-[#C8E695]/20 dark:text-[#C8E695]"
            >
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {{ dir.display_name }}
              </p>
              <p class="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {{ dir.uri }}
              </p>
              <p class="text-[10px] text-zinc-400 dark:text-zinc-500">
                {{ formatRelativeTime(dir.last_scanned_at) }}
              </p>
            </div>
          </div>

          <div class="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              data-testid="dir-active-toggle"
              class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
              :class="
                dir.is_active === 1
                  ? 'bg-[#3E5725] dark:bg-[#C8E695]'
                  : 'bg-zinc-300 dark:bg-zinc-700'
              "
              @click="handleToggleDir(dir)"
            >
              <span
                class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out dark:bg-zinc-900"
                :class="dir.is_active === 1 ? 'translate-x-4' : 'translate-x-0'"
              />
            </button>

            <button
              type="button"
              data-testid="delete-dir-btn"
              class="rounded-xl p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
              @click="confirmDelete(dir)"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="folderToDelete"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        class="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h3 class="mb-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
          {{ t('scanner.deleteFolderConfirmTitle') }}
        </h3>
        <p class="mb-5 text-xs text-zinc-600 dark:text-zinc-400">
          {{
            t('scanner.deleteFolderConfirmMessage', {
              name: folderToDelete.display_name,
            })
          }}
        </p>
        <div class="flex justify-end gap-3">
          <button
            type="button"
            class="rounded-2xl border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            @click="cancelDelete"
          >
            {{ t('scanner.cancel') }}
          </button>
          <button
            type="button"
            data-testid="confirm-delete-dir-btn"
            class="rounded-2xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700"
            @click="executeDelete"
          >
            {{ t('scanner.remove') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
