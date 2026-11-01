<script setup lang="ts">
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useReaderStore } from '../../stores/readerStore';
import type { ScreenOrientationMode } from '../../types';

defineProps<{
  /**
   * Whether to display in compact mode (e.g. inside in-reader bottom sheet)
   */
  compact?: boolean;
}>();

const { t } = useI18n();
const settingsStore = useSettingsStore();
const readerStore = useReaderStore();

const toggleKeepAwake = async (): Promise<void> => {
  const nextValue = !settingsStore.keepScreenAwake;
  readerStore.setKeepScreenAwake(nextValue);
  await settingsStore.setKeepScreenAwake(nextValue);
};

const selectOrientation = async (mode: ScreenOrientationMode): Promise<void> => {
  readerStore.setOrientationLock(mode);
  await settingsStore.setOrientationLock(mode);
};

const toggleVolumeKeyPageTurn = (): void => {
  const nextValue = !settingsStore.volumeKeyPageTurn;
  readerStore.setVolumeKeyPageTurn(nextValue);
  settingsStore.setVolumeKeyPageTurn(nextValue);
};

const toggleInvertVolumeKeys = (): void => {
  const nextValue = !settingsStore.invertVolumeKeys;
  readerStore.setInvertVolumeKeys(nextValue);
  settingsStore.setInvertVolumeKeys(nextValue);
};
</script>

<template>
  <section
    data-testid="screen-control-settings"
    class="space-y-5 rounded-3xl border border-gray-200 bg-white p-5 text-gray-900 shadow-sm"
    :class="{ 'rounded-2xl p-4': compact }"
  >
    <!-- Section Header -->
    <div class="flex items-center justify-between border-b border-gray-100 pb-3">
      <div class="flex items-center gap-2.5">
        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
          <svg
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div>
          <h2 class="text-xs font-bold uppercase tracking-wider text-gray-900">
            {{ t('settings.screenControl') }}
          </h2>
        </div>
      </div>
    </div>

    <!-- 1. Keep Screen Awake Control -->
    <div class="flex items-center justify-between gap-4">
      <div class="flex-1 space-y-0.5 pr-2">
        <label
          for="keep-awake-switch"
          class="block cursor-pointer select-none text-xs font-semibold text-gray-900"
        >
          {{ t('settings.keepScreenAwake') }}
        </label>
        <p class="text-[11px] leading-relaxed text-gray-500">
          {{ t('settings.keepScreenAwakeDesc') }}
        </p>
      </div>

      <!-- Toggle Switch -->
      <button
        id="keep-awake-switch"
        type="button"
        role="switch"
        :aria-checked="settingsStore.keepScreenAwake"
        data-testid="keep-screen-awake-toggle"
        class="focus:outline-hidden relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        :class="settingsStore.keepScreenAwake ? 'bg-indigo-600' : 'bg-gray-200'"
        @click="toggleKeepAwake"
      >
        <span class="sr-only">{{ t('settings.keepScreenAwake') }}</span>
        <span
          class="pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out"
          :class="settingsStore.keepScreenAwake ? 'translate-x-5' : 'translate-x-0'"
        />
      </button>
    </div>

    <!-- 2. Screen Orientation Selector -->
    <div class="space-y-2 border-t border-gray-100 pt-1">
      <div class="flex items-center justify-between">
        <label class="block select-none text-xs font-semibold text-gray-900">
          {{ t('settings.orientationLock') }}
        </label>
        <span class="text-[11px] font-medium capitalize text-gray-500">
          {{
            settingsStore.orientationLock === 'auto'
              ? t('settings.orientationAuto')
              : settingsStore.orientationLock === 'portrait'
                ? t('settings.orientationPortrait')
                : t('settings.orientationLandscape')
          }}
        </span>
      </div>

      <!-- Segmented Button Group (3 Options: Auto, Portrait, Landscape) -->
      <div
        role="group"
        :aria-label="t('settings.orientationLock')"
        class="grid grid-cols-3 gap-1.5 rounded-2xl bg-gray-100 p-1"
      >
        <!-- Auto -->
        <button
          type="button"
          data-testid="orientation-auto-btn"
          :aria-pressed="settingsStore.orientationLock === 'auto'"
          class="flex min-h-[44px] select-none items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-all duration-150 active:scale-95"
          :class="
            settingsStore.orientationLock === 'auto'
              ? 'border border-gray-200 bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:bg-white/50 hover:text-gray-900'
          "
          @click="selectOrientation('auto')"
        >
          <!-- Auto Rotate Icon -->
          <svg
            class="h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span class="truncate">{{ t('settings.orientationAuto') }}</span>
        </button>

        <!-- Portrait -->
        <button
          type="button"
          data-testid="orientation-portrait-btn"
          :aria-pressed="settingsStore.orientationLock === 'portrait'"
          class="flex min-h-[44px] select-none items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-all duration-150 active:scale-95"
          :class="
            settingsStore.orientationLock === 'portrait'
              ? 'border border-gray-200 bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:bg-white/50 hover:text-gray-900'
          "
          @click="selectOrientation('portrait')"
        >
          <!-- Portrait Phone Icon -->
          <svg
            class="h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <span class="truncate">{{ t('settings.orientationPortrait') }}</span>
        </button>

        <!-- Landscape -->
        <button
          type="button"
          data-testid="orientation-landscape-btn"
          :aria-pressed="settingsStore.orientationLock === 'landscape'"
          class="flex min-h-[44px] select-none items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-all duration-150 active:scale-95"
          :class="
            settingsStore.orientationLock === 'landscape'
              ? 'border border-gray-200 bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:bg-white/50 hover:text-gray-900'
          "
          @click="selectOrientation('landscape')"
        >
          <!-- Landscape Phone Icon -->
          <svg
            class="h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M18 12h.01M21 16V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2h14a2 2 0 002-2z"
            />
          </svg>
          <span class="truncate">{{ t('settings.orientationLandscape') }}</span>
        </button>
      </div>
    </div>

    <!-- 3. Hardware Volume Key Page Turning -->
    <div class="flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
      <div class="flex-1 space-y-0.5 pr-2">
        <label
          for="volume-key-page-turn-switch"
          class="block cursor-pointer select-none text-xs font-semibold text-gray-900"
        >
          {{ t('settings.volumeKeyPageTurn') }}
        </label>
        <p class="text-[11px] leading-relaxed text-gray-500">
          {{ t('settings.volumeKeyPageTurnDesc') }}
        </p>
      </div>

      <!-- Toggle Switch -->
      <button
        id="volume-key-page-turn-switch"
        type="button"
        role="switch"
        :aria-checked="settingsStore.volumeKeyPageTurn"
        data-testid="volume-key-page-turn-toggle"
        class="focus:outline-hidden relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        :class="settingsStore.volumeKeyPageTurn ? 'bg-indigo-600' : 'bg-gray-200'"
        @click="toggleVolumeKeyPageTurn"
      >
        <span class="sr-only">{{ t('settings.volumeKeyPageTurn') }}</span>
        <span
          class="pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out"
          :class="settingsStore.volumeKeyPageTurn ? 'translate-x-5' : 'translate-x-0'"
        />
      </button>
    </div>

    <!-- 4. Invert Volume Keys (Shown when volumeKeyPageTurn is enabled) -->
    <div
      v-if="settingsStore.volumeKeyPageTurn"
      data-testid="invert-volume-keys-section"
      class="flex items-center justify-between gap-4 border-t border-gray-100 pt-3"
    >
      <div class="flex-1 space-y-0.5 pr-2">
        <label
          for="invert-volume-keys-switch"
          class="block cursor-pointer select-none text-xs font-semibold text-gray-900"
        >
          {{ t('settings.invertVolumeKeys') }}
        </label>
        <p class="text-[11px] leading-relaxed text-gray-500">
          {{ t('settings.invertVolumeKeysDesc') }}
        </p>
      </div>

      <!-- Toggle Switch -->
      <button
        id="invert-volume-keys-switch"
        type="button"
        role="switch"
        :aria-checked="settingsStore.invertVolumeKeys"
        data-testid="invert-volume-keys-toggle"
        class="focus:outline-hidden relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        :class="settingsStore.invertVolumeKeys ? 'bg-indigo-600' : 'bg-gray-200'"
        @click="toggleInvertVolumeKeys"
      >
        <span class="sr-only">{{ t('settings.invertVolumeKeys') }}</span>
        <span
          class="pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out"
          :class="settingsStore.invertVolumeKeys ? 'translate-x-5' : 'translate-x-0'"
        />
      </button>
    </div>
  </section>
</template>
