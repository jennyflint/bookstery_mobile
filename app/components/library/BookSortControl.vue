<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useBookSort, BOOK_SORT_OPTIONS } from '../../composables/useBookSort';
import type { BookSortField, SortOrder, BookSortOption } from '../../types';

const props = withDefaults(
  defineProps<{
    storageKey?: string;
    modelValueField?: BookSortField;
    modelValueOrder?: SortOrder;
  }>(),
  {
    storageKey: 'bookstery_book_sort',
    modelValueField: undefined,
    modelValueOrder: undefined,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValueField', field: BookSortField): void;
  (e: 'update:modelValueOrder', order: SortOrder): void;
  (e: 'change', payload: { field: BookSortField; order: SortOrder }): void;
}>();

const { t } = useI18n();
const bookSort = useBookSort(props.storageKey);

const activeField = computed<BookSortField>(() => {
  return props.modelValueField ?? bookSort.sortField.value;
});

const activeOrder = computed<SortOrder>(() => {
  return props.modelValueOrder ?? bookSort.sortOrder.value;
});

const isOpen = ref(false);
const containerRef = ref<HTMLElement | null>(null);
const menuAlignment = ref<'left' | 'right'>('right');

const currentOption = computed<BookSortOption>(() => {
  const found = BOOK_SORT_OPTIONS.find((opt) => opt.field === activeField.value);
  return found || BOOK_SORT_OPTIONS[0];
});

const updateMenuPosition = (): void => {
  if (typeof window === 'undefined' || !containerRef.value) {
    return;
  }
  const rect = containerRef.value.getBoundingClientRect();
  const menuWidth = 224; // Width of w-56 is 14rem (224px)
  const viewportWidth = window.innerWidth;

  // Check if aligning to the right would push the menu beyond the left edge of the screen
  const overflowsLeftIfRightAligned = rect.right - menuWidth < 12;
  // Check if aligning to the left would push the menu beyond the right edge of the screen
  const overflowsRightIfLeftAligned = rect.left + menuWidth > viewportWidth - 12;

  if (overflowsLeftIfRightAligned && !overflowsRightIfLeftAligned) {
    menuAlignment.value = 'left';
  } else if (overflowsRightIfLeftAligned && !overflowsLeftIfRightAligned) {
    menuAlignment.value = 'right';
  } else {
    // If container is in the left half of the viewport, align left; otherwise align right
    menuAlignment.value = rect.left < viewportWidth / 2 ? 'left' : 'right';
  }
};

const toggleMenu = (): void => {
  if (!isOpen.value) {
    updateMenuPosition();
  }
  isOpen.value = !isOpen.value;
};

const closeMenu = (): void => {
  isOpen.value = false;
};

const handleDirectionClick = (e: Event): void => {
  e.stopPropagation();
  const nextOrder: SortOrder = activeOrder.value === 'asc' ? 'desc' : 'asc';

  if (props.modelValueOrder !== undefined) {
    emit('update:modelValueOrder', nextOrder);
  } else {
    bookSort.toggleSortOrder();
  }

  emit('change', {
    field: activeField.value,
    order: nextOrder,
  });
};

const handleSelectOption = (option: BookSortOption): void => {
  if (activeField.value === option.field) {
    // If clicking already active option, toggle direction
    const nextOrder: SortOrder = activeOrder.value === 'asc' ? 'desc' : 'asc';
    if (props.modelValueOrder !== undefined) {
      emit('update:modelValueOrder', nextOrder);
    } else {
      bookSort.toggleSortOrder();
    }
    emit('change', {
      field: option.field,
      order: nextOrder,
    });
  } else {
    // New option selected
    let nextOrder: SortOrder = 'desc';
    if (option.field === 'title' || option.field === 'author' || option.field === 'format') {
      nextOrder = 'asc';
    }

    if (props.modelValueField !== undefined) {
      emit('update:modelValueField', option.field);
      if (props.modelValueOrder !== undefined) {
        emit('update:modelValueOrder', nextOrder);
      }
    } else {
      bookSort.setSortField(option.field, nextOrder);
    }

    emit('change', {
      field: option.field,
      order: nextOrder,
    });
  }

  closeMenu();
};

const handleDocumentClick = (e: MouseEvent): void => {
  if (isOpen.value && containerRef.value && !containerRef.value.contains(e.target as Node)) {
    closeMenu();
  }
};

onMounted(() => {
  if (typeof document !== 'undefined') {
    document.addEventListener('click', handleDocumentClick, true);
  }
});

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('click', handleDocumentClick, true);
  }
});
</script>

<template>
  <div
    ref="containerRef"
    data-testid="book-sort-control"
    class="relative inline-flex items-center"
  >
    <!-- Combined trigger button group -->
    <div
      class="inline-flex items-stretch rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300"
    >
      <!-- Sort menu open button -->
      <button
        type="button"
        data-testid="sort-trigger-btn"
        class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-900 active:scale-95"
        :title="t('sort.label')"
        @click="toggleMenu"
      >
        <!-- Sort icon -->
        <svg
          class="h-4 w-4 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
          />
        </svg>

        <span class="max-w-[120px] truncate sm:max-w-none">
          {{ t(currentOption.labelKey) }}
        </span>

        <!-- Dropdown arrow -->
        <svg
          class="h-3 w-3 text-zinc-400 transition-transform duration-200"
          :class="{ 'rotate-180': isOpen }"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <!-- Vertical divider -->
      <div class="w-[1px] bg-zinc-200" />

      <!-- Direction quick-toggle button -->
      <button
        type="button"
        data-testid="sort-direction-btn"
        class="inline-flex items-center justify-center px-2.5 py-2 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-indigo-600 active:scale-90"
        :title="activeOrder === 'asc' ? t('sort.asc') : t('sort.desc')"
        @click="handleDirectionClick"
      >
        <span v-if="activeOrder === 'asc'" class="text-xs">↑</span>
        <span v-else class="text-xs">↓</span>
      </button>
    </div>

    <!-- Mobile backdrop for reliable tap-outside on touchscreens -->
    <div
      v-if="isOpen"
      data-testid="sort-mobile-backdrop"
      class="fixed inset-0 z-40 sm:hidden"
      aria-hidden="true"
      @click="closeMenu"
    />

    <!-- Dropdown menu -->
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="transform scale-95 opacity-0 -translate-y-1"
      enter-to-class="transform scale-100 opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="transform scale-100 opacity-100 translate-y-0"
      leave-to-class="transform scale-95 opacity-0 -translate-y-1"
    >
      <div
        v-if="isOpen"
        data-testid="sort-dropdown-menu"
        class="absolute top-full z-50 mt-1.5 w-52 sm:w-56 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5"
        :class="menuAlignment === 'left' ? 'left-0' : 'right-0'"
      >
        <div class="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          {{ t('sort.label') }}
        </div>

        <div class="space-y-0.5">
          <button
            v-for="option in BOOK_SORT_OPTIONS"
            :key="option.field"
            type="button"
            :data-testid="`sort-option-${option.field}`"
            class="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-medium transition-colors"
            :class="
              activeField === option.field
                ? 'bg-indigo-50 font-bold text-indigo-700'
                : 'text-zinc-700 hover:bg-zinc-100'
            "
            @click="handleSelectOption(option)"
          >
            <span>{{ t(option.labelKey) }}</span>

            <span
              v-if="activeField === option.field"
              :data-testid="`sort-option-active-${option.field}`"
              class="flex items-center gap-1 text-indigo-600"
            >
              <span class="text-[11px] font-semibold">
                {{ activeOrder === 'asc' ? '↑' : '↓' }}
              </span>
              <svg
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.5"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
