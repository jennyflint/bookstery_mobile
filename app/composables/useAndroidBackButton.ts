import { onBeforeUnmount, getCurrentInstance } from 'vue';
import { useRouter } from 'vue-router';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { useTextSelection } from './useTextSelection';
import { useHighlightStore } from '../stores/highlightStore';
import { useAiStore } from '../stores/aiStore';
import {
  exitApp,
  isNativeReaderBridgeAvailable,
  NativeReaderBridge,
} from '../services/NativeReaderBridge';

export type BackButtonHandler = () => boolean | Promise<boolean>;

export const BACK_PRIORITY = {
  /** Priority 1: Active reader overlays, zoom reset, local modals, text selection dismissal */
  OVERLAY: 100,
  /** Priority 2: Non-root route exit cleanup before navigating to root (e.g. reader save) */
  ROUTE: 50,
  /** Priority 3: Root main menu modals (e.g. scanner modal, book assign modal) */
  ROOT_MODAL: 10,
} as const;

interface RegisteredHandler {
  id: number;
  priority: number;
  handler: BackButtonHandler;
}

let nextHandlerId = 1;
const registeredHandlers: RegisteredHandler[] = [];
let isHandling = false;
let isListenerInitialized = false;
let activeRouter: ReturnType<typeof useRouter> | null = null;
let capacitorAppListener: PluginListenerHandle | null = null;
let nativeBridgeListener: PluginListenerHandle | null = null;

/**
 * Registers a handler to be evaluated on Android hardware back button press.
 * Handlers return `true` if they consumed the back action, or `false` to pass to the next handler.
 * Automatically unregisters when the calling component unmounts.
 */
export function registerBackHandler(
  handler: BackButtonHandler,
  priority: number = BACK_PRIORITY.OVERLAY,
): () => void {
  const id = nextHandlerId++;
  registeredHandlers.push({ id, priority, handler });

  const unregister = (): void => {
    const idx = registeredHandlers.findIndex((item) => item.id === id);
    if (idx !== -1) {
      registeredHandlers.splice(idx, 1);
    }
  };

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      unregister();
    });
  }

  return unregister;
}

/**
 * Central evaluation of Android hardware back button / swipe-back navigation.
 * Evaluates actions in strict priority order:
 * 1. Active reader overlays, text selection, and modals.
 * 2. Non-root routes (cleanly replace route to '/' without history loops).
 * 3. Root main menu (close home modals, or exit the Android app).
 */
export async function handleBackButtonPress(): Promise<void> {
  if (isHandling) {
    return;
  }
  isHandling = true;

  try {
    // -----------------------------------------------------------------------------------
    // Priority 1 — Active Reader Overlays / Selection / Modals
    // -----------------------------------------------------------------------------------

    // 1a. Text selection dismissal
    const textSelection = useTextSelection();
    if (textSelection.hasStickySelection()) {
      textSelection.dismissSelection();
      return;
    }

    // 1b. Registered Priority 1 Handlers (priority >= 100)
    const overlayHandlers = registeredHandlers
      .filter((h) => h.priority >= BACK_PRIORITY.OVERLAY)
      .sort((a, b) => b.priority - a.priority);

    for (const item of overlayHandlers) {
      const handled = await item.handler();
      if (handled) {
        return;
      }
    }

    // 1c. Store-backed reader highlight modals & drawer
    const highlightStore = useHighlightStore();
    if (highlightStore.isNoteModalOpen) {
      highlightStore.closeNoteModal();
      return;
    }
    if (highlightStore.isQuoteCardModalOpen) {
      highlightStore.closeQuoteCardModal();
      return;
    }
    if (highlightStore.isExportModalOpen) {
      highlightStore.closeExportModal();
      return;
    }
    if (highlightStore.isNotesDrawerOpen) {
      highlightStore.closeNotesDrawer();
      return;
    }
    if (highlightStore.selectedHighlight) {
      highlightStore.selectedHighlight = null;
      return;
    }

    // 1d. Store-backed AI overlays & drawers
    const aiStore = useAiStore();
    if (aiStore.isChatDrawerOpen) {
      aiStore.closeChat();
      return;
    }
    if (aiStore.isDictionaryModalOpen) {
      aiStore.closeDictionaryModal();
      return;
    }
    if (aiStore.isSheetOpen) {
      aiStore.closeSheet();
      return;
    }
    if (aiStore.isSettingsModalOpen) {
      aiStore.closeSettingsModal();
      return;
    }
    if (aiStore.isOnboardingModalOpen) {
      aiStore.closeOnboardingModal();
      return;
    }
    if (aiStore.showInactivityBanner) {
      aiStore.dismissInactivityBanner();
      return;
    }

    // -----------------------------------------------------------------------------------
    // Priority 2 — Non-Root Routes (Reader, Settings, Dictionary, Collections, etc.)
    // -----------------------------------------------------------------------------------
    const router = activeRouter ?? useRouter();
    const currentPath = router.currentRoute.value.path;
    const isRoot = currentPath === '/' || currentPath === '/library';

    if (!isRoot) {
      // Call any registered route exit handlers (priority 50..99, e.g. reader save & cleanup)
      const routeHandlers = registeredHandlers
        .filter((h) => h.priority >= BACK_PRIORITY.ROUTE && h.priority < BACK_PRIORITY.OVERLAY)
        .sort((a, b) => b.priority - a.priority);

      for (const item of routeHandlers) {
        const handled = await item.handler();
        if (handled) {
          return;
        }
      }

      // Default non-root navigation: replace to library root without accumulating history entries
      await router.replace('/');
      return;
    }

    // -----------------------------------------------------------------------------------
    // Priority 3 — Root Main Menu (route.path === '/')
    // -----------------------------------------------------------------------------------

    // 3a. Home-screen modals (priority 10..49, e.g. folder scanner modal, book assign modal)
    const rootModalHandlers = registeredHandlers
      .filter((h) => h.priority >= BACK_PRIORITY.ROOT_MODAL && h.priority < BACK_PRIORITY.ROUTE)
      .sort((a, b) => b.priority - a.priority);

    for (const item of rootModalHandlers) {
      const handled = await item.handler();
      if (handled) {
        return;
      }
    }

    // 3b. No modals open on root screen -> Cleanly exit the Android application
    await exitApp();
  } catch (error) {
    console.error('[useAndroidBackButton] Error handling back button:', error);
  } finally {
    isHandling = false;
  }
}

/**
 * Initializes the root hardware back button listener.
 * Called once at the root application level in `app.vue`.
 */
export function initBackButtonListener(customRouter?: ReturnType<typeof useRouter>): void {
  if (customRouter) {
    activeRouter = customRouter;
  } else if (!activeRouter) {
    try {
      activeRouter = useRouter();
    } catch {}
  }

  if (isListenerInitialized) {
    return;
  }
  isListenerInitialized = true;

  // 1. Primary: Capacitor @capacitor/app listener
  Promise.resolve(
    App.addListener('backButton', () => {
      void handleBackButtonPress();
    }),
  )
    .then((handle) => {
      capacitorAppListener = handle;
    })
    .catch((err) => {
      console.warn('[useAndroidBackButton] App.addListener(backButton) unavailable:', err);
    });

  // 2. NativeReaderBridge fallback listener if available
  if (isNativeReaderBridgeAvailable()) {
    Promise.resolve(
      NativeReaderBridge.addListener('backButtonPressed', () => {
        void handleBackButtonPress();
      }),
    )
      .then((handle) => {
        nativeBridgeListener = handle;
      })
      .catch(() => {});
  }

  // 3. Web browser popstate fallback (dev mode / browser testing)
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
      void handleBackButtonPress();
    });
  }
}

/**
 * Disposes the root back button listeners (primarily for testing and hot reloading).
 */
export async function disposeBackButtonListener(): Promise<void> {
  if (capacitorAppListener) {
    try {
      await capacitorAppListener.remove();
    } catch {}
    capacitorAppListener = null;
  }
  if (nativeBridgeListener) {
    try {
      await nativeBridgeListener.remove();
    } catch {}
    nativeBridgeListener = null;
  }
  isListenerInitialized = false;
  registeredHandlers.length = 0;
}

export function useAndroidBackButton() {
  return {
    initBackButtonListener,
    disposeBackButtonListener,
    registerBackHandler,
    handleBackButtonPress,
  };
}
