<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted } from 'vue';
import { useAiStore } from '../../stores/aiStore';
import { useReaderStore } from '../../stores/readerStore';
import type { CustomQuickPrompt } from '../../types';

const props = defineProps<{
  pageText?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { t } = useI18n();
const aiStore = useAiStore();
const readerStore = useReaderStore();

const messageListRef = ref<HTMLElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const userInput = ref('');
const copyFeedbackId = ref<string | null>(null);

const activeBookTitle = computed(() => readerStore.currentBook?.title || t('reader.book'));
const activeAuthor = computed(() => readerStore.currentBook?.author || '');
const currentPageNum = computed(() => readerStore.currentPage || readerStore.locator || 1);

const scrollToBottom = async () => {
  await nextTick();
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
  }
};

watch(
  () => aiStore.chatMessages.length,
  () => {
    void scrollToBottom();
  },
);

watch(
  () => aiStore.isChatStreaming,
  (isStreaming) => {
    if (isStreaming) {
      void scrollToBottom();
    }
  },
);

onMounted(() => {
  if (aiStore.isChatDrawerOpen) {
    void scrollToBottom();
  }
});

const handleSendMessage = async () => {
  const text = userInput.value.trim();
  if (!text || aiStore.isChatStreaming) return;

  userInput.value = '';
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
  }

  await aiStore.sendChatMessage({
    userText: text,
    bookTitle: activeBookTitle.value,
    author: activeAuthor.value,
    currentPage: currentPageNum.value,
    pageContext: props.pageText,
  });
};

const handleSendPresetPrompt = async (preset: CustomQuickPrompt) => {
  if (aiStore.isChatStreaming) return;
  await aiStore.sendChatMessage({
    userText: preset.prompt,
    bookTitle: activeBookTitle.value,
    author: activeAuthor.value,
    currentPage: currentPageNum.value,
    pageContext: props.pageText,
  });
};

const handleRegenerate = async () => {
  if (aiStore.isChatStreaming) return;
  await aiStore.regenerateLastChatMessage({
    bookTitle: activeBookTitle.value,
    author: activeAuthor.value,
    currentPage: currentPageNum.value,
    pageContext: props.pageText,
  });
};

const handleClearChat = async () => {
  if (!readerStore.currentBook?.id) return;
  await aiStore.clearChatHistory(readerStore.currentBook.id);
};

const handleCopyMessage = async (id: string, content: string) => {
  const success = await aiStore.copyChatMessage(content);
  if (success) {
    copyFeedbackId.value = id;
    setTimeout(() => {
      if (copyFeedbackId.value === id) {
        copyFeedbackId.value = null;
      }
    }, 2000);
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void handleSendMessage();
  }
};

const autoExpandTextarea = () => {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  const newHeight = Math.min(el.scrollHeight, 120);
  el.style.height = `${newHeight}px`;
};

const renderMarkdown = (text: string): string => {
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/^\s*[-*]\s+(.*)$/gm, '<li class="ml-4 list-disc text-inherit">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
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
        v-if="aiStore.isChatDrawerOpen"
        class="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
        @click="aiStore.closeChat"
      />
    </Transition>

    <!-- Slide-over Drawer -->
    <Transition
      enter-active-class="transform transition ease-out duration-300"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transform transition ease-in duration-200"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="aiStore.isChatDrawerOpen"
        data-testid="ai-chat-drawer"
        class="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-gray-200 bg-white text-gray-900 shadow-2xl sm:max-w-lg"
      >
        <!-- Header -->
        <header
          class="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3"
          :style="{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#C8E695] text-[#3E5725]">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>
            <div class="min-w-0">
              <h2 class="truncate text-sm font-bold text-gray-900">
                {{ t('ai.chatTitle') }}
              </h2>
              <p class="truncate text-xs font-medium text-gray-500">
                {{ activeBookTitle }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <!-- Clear Chat Button -->
            <button
              v-if="aiStore.chatMessages.length > 0"
              type="button"
              data-testid="clear-chat-btn"
              class="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 active:scale-95"
              :title="t('ai.clearChat')"
              @click="handleClearChat"
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

            <!-- Close Drawer Button -->
            <button
              type="button"
              data-testid="close-chat-btn"
              class="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 active:scale-95"
              :title="t('common.close')"
              @click="aiStore.closeChat"
            >
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <!-- Messages Thread -->
        <div
          ref="messageListRef"
          class="flex-1 space-y-4 overflow-y-auto p-4 select-text"
        >
          <!-- Welcome Empty State -->
          <div
            v-if="aiStore.chatMessages.length === 0"
            class="flex flex-col items-center justify-center py-10 text-center"
          >
            <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C8E695]/40 text-[#3E5725]">
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <h3 class="text-sm font-bold text-gray-900">{{ t('ai.chatWelcome') }}</h3>
            <p class="mt-1 max-w-xs text-xs text-gray-500">
              {{ t('ai.chatWelcomeSubtitle') }}
            </p>
          </div>

          <!-- Message Bubbles -->
          <div
            v-for="msg in aiStore.chatMessages"
            :key="msg.id"
            class="flex flex-col"
            :class="msg.role === 'user' ? 'items-end' : 'items-start'"
          >
            <!-- User Quote Snippet Pill -->
            <div
              v-if="msg.contextSnippet"
              class="mb-1 max-w-[85%] rounded-lg border border-indigo-100 bg-indigo-50/70 px-2.5 py-1 text-[11px] text-indigo-800 italic truncate"
            >
              "{{ msg.contextSnippet }}"
            </div>

            <!-- Bubble -->
            <div
              :data-message-id="msg.id"
              :data-block-id="msg.id"
              :data-part-type="msg.role === 'user' ? 'dialogue' : 'narration'"
              class="group relative max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs"
              :class="
                msg.role === 'user'
                  ? 'bg-[#3E5725] text-white rounded-br-xs'
                  : 'bg-gray-100 text-gray-900 rounded-bl-xs border border-gray-200'
              "
            >
              <!-- Message Text -->
              <div
                v-if="msg.role === 'assistant'"
                class="prose-xs"
                v-html="renderMarkdown(msg.content)"
              />
              <div v-else class="whitespace-pre-wrap">
                {{ msg.content }}
              </div>

              <!-- Streaming Pulse Cursor -->
              <span
                v-if="aiStore.isChatStreaming && msg.role === 'assistant' && !msg.content"
                class="inline-block h-3 w-1.5 animate-pulse bg-gray-500"
              />

              <!-- Copy Action Hover Button -->
              <button
                v-if="msg.content"
                type="button"
                class="absolute -bottom-3 right-2 flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 opacity-0 shadow-xs transition-opacity group-hover:opacity-100 hover:text-gray-900"
                :title="t('translation.copy')"
                @click="handleCopyMessage(msg.id, msg.content)"
              >
                <span>{{ copyFeedbackId === msg.id ? t('translation.copied') : t('translation.copy') }}</span>
              </button>
            </div>
          </div>

          <!-- Error Alert Banner -->
          <div
            v-if="aiStore.chatError"
            data-testid="ai-chat-error-banner"
            class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
          >
            <div class="flex items-start justify-between gap-2">
              <span class="font-medium">{{ aiStore.chatError }}</span>
              <button
                type="button"
                class="text-xs font-bold text-rose-900 underline"
                @click="handleRegenerate"
              >
                {{ t('ai.regenerate') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Footer / Input Controls -->
        <footer
          class="border-t border-gray-200 bg-white p-3 space-y-2.5"
          :style="{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }"
        >
          <!-- Quick Action Preset Chips -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              v-for="preset in aiStore.customQuickPrompts"
              :key="preset.id"
              type="button"
              class="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-700 transition-all hover:border-[#3E5725] hover:bg-white active:scale-95 disabled:opacity-50"
              :disabled="aiStore.isChatStreaming"
              @click="handleSendPresetPrompt(preset)"
            >
              {{ preset.title }}
            </button>
          </div>

          <!-- Attached Context Pills -->
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <!-- Quoted Selection Pill -->
            <div
              v-if="aiStore.attachedSelection"
              class="flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700"
            >
              <span class="max-w-[180px] truncate">"{{ aiStore.attachedSelection }}"</span>
              <button
                type="button"
                class="ml-0.5 hover:text-indigo-900"
                @click="aiStore.setAttachedSelection(null)"
              >
                &times;
              </button>
            </div>

            <!-- Page Context Toggle Pill -->
            <button
              type="button"
              class="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all"
              :class="
                aiStore.includePageContext
                  ? 'border-[#3E5725] bg-[#C8E695]/30 text-[#3E5725]'
                  : 'border-gray-200 bg-gray-50 text-gray-500'
              "
              @click="aiStore.setIncludePageContext(!aiStore.includePageContext)"
            >
              <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>{{ t('ai.includePageText') }}</span>
            </button>
          </div>

          <!-- Input Textarea & Send / Stop Button -->
          <div class="relative flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-1.5 focus-within:border-[#3E5725] focus-within:bg-white focus-within:ring-1 focus-within:ring-[#3E5725]">
            <textarea
              ref="textareaRef"
              v-model="userInput"
              data-testid="ai-chat-input"
              rows="1"
              :placeholder="t('ai.askQuestionPlaceholder')"
              class="w-full resize-none border-none bg-transparent px-2.5 py-1 text-xs text-gray-900 placeholder-gray-400 focus:outline-hidden"
              @input="autoExpandTextarea"
              @keydown="handleKeydown"
            />

            <!-- Stop Generation Button (when streaming) -->
            <button
              v-if="aiStore.isChatStreaming"
              type="button"
              data-testid="abort-chat-btn"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-xs transition-all hover:bg-rose-700 active:scale-95"
              :title="t('ai.stopGenerating')"
              @click="aiStore.abortChatStream"
            >
              <div class="h-2.5 w-2.5 bg-white rounded-xs" />
            </button>

            <!-- Send Button -->
            <button
              v-else
              type="button"
              data-testid="send-chat-btn"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#3E5725] text-white shadow-xs transition-all hover:bg-[#3E5725]/90 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
              :disabled="!userInput.trim()"
              :title="t('ai.sendMessage')"
              @click="handleSendMessage"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </footer>
      </aside>
    </Transition>
  </div>
</template>
