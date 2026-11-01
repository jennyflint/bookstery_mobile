<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Capacitor } from '@capacitor/core';
import { useTtsStore } from '../../stores/ttsStore';
import { SUPPORTED_TTS_LANGUAGES } from '../../types';

const { t } = useI18n();
const ttsStore = useTtsStore();

const isNative = Capacitor.isNativePlatform();
const isVoiceModalOpen = ref(false);
const showAllVoices = ref(false);

onMounted(async () => {
  await ttsStore.loadVoices();
});

const toggleVoiceModal = (): void => {
  isVoiceModalOpen.value = !isVoiceModalOpen.value;
};

const closeVoiceModal = (): void => {
  isVoiceModalOpen.value = false;
};

const handleSelectVoice = async (voiceURI: string | null): Promise<void> => {
  await ttsStore.setVoice(voiceURI);
  closeVoiceModal();
};

const handleSelectLanguage = async (langCode: string | null): Promise<void> => {
  await ttsStore.setLanguage(langCode);
};

const displayedVoices = computed(() => {
  if (showAllVoices.value) {
    return ttsStore.availableVoices;
  }
  return ttsStore.matchingVoices;
});
</script>

<template>
  <div
    v-if="ttsStore.isActive"
    data-testid="tts-player-bar"
    class="fixed bottom-0 inset-x-0 z-40 bg-white text-gray-900 border-t border-gray-200 shadow-xl px-4 py-3"
    :style="{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }"
  >
    <!-- Top row: preview text & progress counter -->
    <div class="mb-2.5 flex items-center justify-between gap-3 text-xs">
      <div
        data-testid="tts-sentence-preview"
        class="line-clamp-1 flex-1 font-medium text-gray-600"
        :title="ttsStore.currentSentence?.text || ''"
      >
        {{ ttsStore.currentSentence?.text || t('tts.noText') }}
      </div>

      <div
        v-if="ttsStore.totalSentences > 0"
        data-testid="tts-sentence-progress"
        class="shrink-0 text-[11px] font-semibold text-gray-400"
      >
        {{
          t('tts.sentenceProgress', {
            current: ttsStore.currentIndex + 1,
            total: ttsStore.totalSentences,
          })
        }}
      </div>
    </div>

    <!-- Main controls row -->
    <div class="flex items-center justify-between gap-2">
      <!-- Left side: Speed button & Voice popover button -->
      <div class="flex items-center gap-1.5">
        <!-- Speed cycle button -->
        <button
          type="button"
          data-testid="tts-rate-btn"
          class="rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-bold text-gray-700 shadow-2xs transition-colors hover:bg-gray-100 active:scale-95"
          :title="t('tts.speed')"
          @click="ttsStore.cycleRate"
        >
          {{ ttsStore.rate }}x
        </button>

        <!-- Language & Voice button -->
        <button
          type="button"
          data-testid="tts-voice-btn"
          class="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-bold text-gray-700 shadow-2xs transition-colors hover:bg-gray-100 active:scale-95"
          :title="t('tts.voice')"
          @click="toggleVoiceModal"
        >
          <span class="text-[11px] uppercase font-bold text-indigo-600">
            {{ ttsStore.activeLang.split(/[-_]/)[0] }}
          </span>
          <svg class="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </button>
      </div>

      <!-- Center: Transport (Prev, Play/Pause, Next) -->
      <div class="flex items-center gap-2">
        <!-- Previous sentence -->
        <button
          type="button"
          data-testid="tts-prev-btn"
          class="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 active:scale-90 disabled:opacity-30"
          :disabled="ttsStore.currentIndex <= 0"
          :title="t('tts.previousSentence')"
          @click="ttsStore.prevSentence"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <!-- Play / Pause toggle -->
        <button
          type="button"
          data-testid="tts-play-pause-btn"
          class="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95"
          :title="ttsStore.isPlaying ? t('tts.pause') : t('tts.play')"
          @click="ttsStore.isPlaying ? ttsStore.pause() : ttsStore.resume()"
        >
          <!-- Pause icon -->
          <svg
            v-if="ttsStore.isPlaying"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 9v6m4-6v6" />
          </svg>
          <!-- Play icon -->
          <svg
            v-else
            class="h-5 w-5 ml-0.5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>

        <!-- Next sentence -->
        <button
          type="button"
          data-testid="tts-next-btn"
          class="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 active:scale-90"
          :title="t('tts.nextSentence')"
          @click="ttsStore.nextSentence"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <!-- Right side: Stop button -->
      <div class="flex items-center justify-end">
        <button
          type="button"
          data-testid="tts-stop-btn"
          class="rounded-xl p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 active:scale-95"
          :title="t('tts.stop')"
          @click="ttsStore.stop"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Voice Selection Modal -->
    <div
      v-if="isVoiceModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="closeVoiceModal"
    >
      <div
        data-testid="tts-voice-modal"
        class="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
      >
        <div class="mb-3 flex items-center justify-between border-b border-gray-100 pb-2">
          <h3 class="text-sm font-bold text-gray-900">
            {{ t('tts.voice') }} &amp; {{ t('tts.language') }}
          </h3>
          <button
            type="button"
            class="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            @click="closeVoiceModal"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Language Picker Chips -->
        <div class="mb-3">
          <label class="mb-1.5 block text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            {{ t('tts.language') }}
          </label>
          <div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-0.5">
            <button
              type="button"
              data-testid="tts-lang-auto-btn"
              class="rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors"
              :class="
                !ttsStore.selectedLanguage
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              "
              @click="handleSelectLanguage(null)"
            >
              {{ t('tts.autoLanguage', { lang: ttsStore.activeLang.split(/[-_]/)[0] }) }}
            </button>
            <button
              v-for="l in SUPPORTED_TTS_LANGUAGES"
              :key="l.code"
              type="button"
              :data-testid="`tts-lang-btn-${l.code}`"
              class="rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors"
              :class="
                ttsStore.activeLang.toLowerCase().replace('_', '-').startsWith(l.code.toLowerCase().replace('_', '-'))
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              "
              @click="handleSelectLanguage(l.code)"
            >
              {{ l.nativeName }}
            </button>
          </div>
        </div>

        <!-- Warning when no voice installed for this language -->
        <div
          v-if="!ttsStore.hasVoiceForActiveLang"
          data-testid="tts-no-voice-warning"
          class="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800"
        >
          <div class="font-bold flex items-center gap-1.5">
            <svg class="h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {{ t('tts.noVoiceForLanguage', { lang: ttsStore.activeLang }) }}
          </div>
          <p class="mt-1 text-[11px] text-amber-700">
            {{ isNative ? t('tts.installVoiceHint') : t('tts.onlineFallbackHint') }}
          </p>
          <button
            v-if="isNative"
            type="button"
            data-testid="tts-install-voice-btn"
            class="mt-2 w-full rounded-lg bg-amber-600 px-2.5 py-1.5 text-center text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-amber-700 active:scale-95"
            @click="ttsStore.openInstall"
          >
            {{ t('tts.installVoiceBtn') }}
          </button>
        </div>

        <!-- Voices Section -->
        <div>
          <div class="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            <span>{{ t('tts.voice') }}</span>
            <button
              v-if="ttsStore.availableVoices.length > ttsStore.matchingVoices.length"
              type="button"
              class="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 normal-case"
              @click="showAllVoices = !showAllVoices"
            >
              {{ showAllVoices ? t('tts.voice') : t('tts.allVoices') + ` (${ttsStore.availableVoices.length})` }}
            </button>
          </div>

          <div class="max-h-52 space-y-1 overflow-y-auto pr-1">
            <!-- Default automatic voice -->
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors"
              :class="
                !ttsStore.selectedVoice
                  ? 'bg-indigo-50 font-bold text-indigo-700'
                  : 'text-gray-700 hover:bg-gray-50'
              "
              @click="handleSelectVoice(null)"
            >
              <span>{{ t('tts.autoDetect', { lang: ttsStore.activeLang }) }}</span>
              <svg
                v-if="!ttsStore.selectedVoice"
                class="h-4 w-4 text-indigo-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </button>

            <!-- Listed voices -->
            <div
              v-if="displayedVoices.length === 0 && !showAllVoices"
              class="px-3 py-2 text-center text-xs text-gray-400 italic"
            >
              {{ t('tts.noVoiceForLanguage', { lang: ttsStore.activeLang }) }}
            </div>

            <button
              v-for="v in displayedVoices"
              :key="v.voiceURI"
              type="button"
              :data-testid="`tts-voice-item-${v.voiceURI}`"
              class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors"
              :class="
                ttsStore.selectedVoice === v.voiceURI
                  ? 'bg-indigo-50 font-bold text-indigo-700'
                  : 'text-gray-700 hover:bg-gray-50'
              "
              @click="handleSelectVoice(v.voiceURI)"
            >
              <div class="truncate">
                <div class="truncate font-semibold">{{ v.name }}</div>
                <div class="text-[10px] text-gray-400">{{ v.lang }}</div>
              </div>

              <svg
                v-if="ttsStore.selectedVoice === v.voiceURI"
                class="h-4 w-4 shrink-0 text-indigo-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
