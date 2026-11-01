<script setup lang="ts">
import { useAiStore } from '../../stores/aiStore';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-settings'): void;
}>();

const { t } = useI18n();
const aiStore = useAiStore();

const handleConfigureKey = () => {
  aiStore.openSettingsModal();
  emit('open-settings');
};

const handleClose = () => {
  aiStore.closeOnboardingModal();
  emit('close');
};
</script>

<template>
  <div>
    <!-- Backdrop -->
    <Transition
      enter-active-class="transition-opacity duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        class="fixed inset-0 z-50 bg-black/50"
        @click="handleClose"
      />
    </Transition>

    <!-- Modal Card with solid white background -->
    <Transition
      enter-active-class="transform transition ease-out duration-300"
      enter-from-class="opacity-0 scale-95 translate-y-4"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transform transition ease-in duration-200"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-4"
    >
      <div
        data-testid="ai-key-instruction-modal"
        class="fixed inset-x-4 top-1/2 z-50 mx-auto max-h-[90vh] w-full max-w-md -translate-y-1/2 flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white text-gray-900 shadow-2xl"
      >
        <!-- Header -->
        <header class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#C8E695] text-[#3E5725]">
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
            <div>
              <h3 class="text-base font-bold text-gray-900">
                {{ t('ai.instructionModalTitle') }}
              </h3>
              <p class="text-xs font-medium text-gray-500">
                {{ t('ai.instructionModalSubtitle') }}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="instruction-close-x-btn"
            class="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 active:scale-95"
            :title="t('common.close')"
            @click="handleClose"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <!-- Body / Step-by-Step Instructions -->
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-xs leading-relaxed text-gray-700 select-text">
          <div class="space-y-3">
            <!-- Step 1 -->
            <div class="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50/80 p-3.5">
              <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3E5725] text-[11px] font-bold text-white">
                1
              </div>
              <div class="space-y-0.5">
                <h4 class="font-bold text-gray-900">
                  {{ t('ai.instructionStep1Title') }}
                </h4>
                <p class="text-gray-600">
                  {{ t('ai.instructionStep1') }}
                </p>
              </div>
            </div>

            <!-- Step 2 -->
            <div class="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50/80 p-3.5">
              <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3E5725] text-[11px] font-bold text-white">
                2
              </div>
              <div class="space-y-0.5">
                <h4 class="font-bold text-gray-900">
                  {{ t('ai.instructionStep2Title') }}
                </h4>
                <p class="text-gray-600">
                  {{ t('ai.instructionStep2') }}
                </p>
              </div>
            </div>

            <!-- Step 3 -->
            <div class="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50/80 p-3.5">
              <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3E5725] text-[11px] font-bold text-white">
                3
              </div>
              <div class="space-y-0.5">
                <h4 class="font-bold text-gray-900">
                  {{ t('ai.instructionStep3Title') }}
                </h4>
                <p class="text-gray-600">
                  {{ t('ai.instructionStep3') }}
                </p>
              </div>
            </div>
          </div>

          <!-- Privacy Guarantee Pill -->
          <div class="flex items-start gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 text-[11px] text-emerald-800">
            <svg class="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p>
              {{ t('ai.instructionPrivacyNote') }}
            </p>
          </div>
        </div>

        <!-- Footer Actions -->
        <footer class="flex flex-col gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4">
          <button
            type="button"
            data-testid="instruction-connect-key-btn"
            class="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#3E5725] py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#3E5725]/90 active:scale-95"
            @click="handleConfigureKey"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{{ t('ai.connectKey') }}</span>
          </button>

          <button
            type="button"
            data-testid="instruction-close-btn"
            class="w-full rounded-2xl py-2 text-xs font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 active:scale-95"
            @click="handleClose"
          >
            {{ t('ai.maybeLater') }}
          </button>
        </footer>
      </div>
    </Transition>
  </div>
</template>
